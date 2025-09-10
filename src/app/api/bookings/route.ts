import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { QuoteRequestSchema } from "@/packages/pricing/types";
import { computeQuote } from "@/packages/pricing";

const CreateBookingSchema = z.object({
  quote: QuoteRequestSchema,
  customer: z.object({
    email: z.string().email(),
    phone: z.string().optional()
  }),
  address: z.object({
    zip: z.string().min(1),
    street: z.string().optional(),
    city: z.string().optional()
  })
});

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  
  // Idempotency is mandatory for booking creation
  const idemRaw = req.headers.get("idempotency-key");
  const idem = idemRaw ? idemRaw.trim() : "";
  if (!idem) {
    return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  }

  try {
    const json = await req.json();
    const parsed = CreateBookingSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
    }

    const { quote: quoteReq, customer, address } = parsed.data;
    
    const sb = supabaseAdmin();

    // Get tenant and service for validation
    const { data: tenant, error: tenantErr } = await sb
      .from("tenants")
      .select("id, currency, vat_rate, rut_enabled, is_active")
      .eq("id", quoteReq.tenantId)
      .maybeSingle();

    if (tenantErr) throw tenantErr;
    if (!tenant || !tenant.is_active) {
      return NextResponse.json({ error: "TENANT_NOT_FOUND_OR_INACTIVE" }, { status: 404 });
    }

    const { data: service, error: serviceErr } = await sb
      .from("services")
      .select("id, model, config, is_active")
      .eq("tenant_id", quoteReq.tenantId)
      .eq("key", quoteReq.serviceKey)
      .maybeSingle();

    if (serviceErr) throw serviceErr;
    if (!service || !service.is_active) {
      return NextResponse.json({ error: "SERVICE_NOT_FOUND_OR_INACTIVE" }, { status: 404 });
    }

    // Compute quote to get final pricing
    const quote = computeQuote({
      req: quoteReq,
      tenant: {
        currency: tenant.currency,
        vat_rate: tenant.vat_rate,
        rut_enabled: tenant.rut_enabled
      },
      service: {
        model: service.model as "fixed" | "hourly" | "per_sqm" | "per_room" | "windows",
        schemaVersion: 1,
        config: service.config,
        name: quoteReq.serviceKey
      }
    });

    const amount_due_minor = Math.round(quote.total * 100);

    // 0) Fast path: if a booking with this (tenant,idempotency) already exists, return it.
    {
      const { data: existing, error: exErr } = await sb
        .from("bookings")
        .select("id, status, amount_due_minor, created_at")
        .eq("tenant_id", quoteReq.tenantId)
        .eq("idempotency_key", idem)
        .maybeSingle();
      if (exErr) throw exErr;
      if (existing) {
        const durationMs = Date.now() - t0;
        log("bookings.create.idempotent", { 
          tenantId: quoteReq.tenantId, 
          serviceKey: quoteReq.serviceKey, 
          idempotencyKey: idem, 
          bookingId: existing.id, 
          durationMs 
        });
        return NextResponse.json({
          ok: true,
          id: existing.id,
          status: existing.status,
          amount_due_minor: existing.amount_due_minor,
          created_at: existing.created_at
        }, { status: 200, headers: { "Idempotency-Key": idem } });
      }
    }

    // 1) Insert with UPSERT on (tenant_id, idempotency_key) to guarantee single row
    const insertPayload = {
      tenant_id: quoteReq.tenantId,
      service_key: quoteReq.serviceKey,
      status: "pending" as const,
      quote_request: quoteReq,
      quote_response: quote,
      amount_due_minor: amount_due_minor,
      customer_email: customer.email,
      customer_phone: customer.phone,
      address_zip: address.zip,
      address_street: address.street,
      address_city: address.city,
      idempotency_key: idem
    };

    const { data: up, error: upErr } = await sb
      .from("bookings")
      .upsert(insertPayload, { onConflict: "tenant_id,idempotency_key" })
      .select("id, status, created_at")
      .maybeSingle();

    if (upErr) throw upErr;
    const bookingRow = up!;

    const durationMs = Date.now() - t0;
    log("bookings.create.ok", {
      tenantId: quoteReq.tenantId, 
      serviceKey: quoteReq.serviceKey, 
      durationMs, 
      idempotencyKey: idem, 
      bookingId: bookingRow.id
    });

    return NextResponse.json({
      ok: true,
      id: bookingRow.id,
      status: "pending",
      amount_due_minor: amount_due_minor,
      created_at: bookingRow.created_at
    }, { status: 201, headers: { "Idempotency-Key": idem } });

  } catch (error: unknown) {
    const err = error as Error;
    log("bookings.create.error", { message: err?.message, durationMs: Date.now() - t0 });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
