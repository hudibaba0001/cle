import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { computeQuoteV2 } from "@/lib/pricing-v2/engine";
import { FrequencyKey, ServiceConfig } from "@/lib/pricing-v2/types";

const CreateBookingSchema = z.object({
  service_id: z.string().uuid(),
  frequency: FrequencyKey.default("one_time"),
  inputs: z.record(z.string(), z.unknown()).default({}),
  answers: z.record(z.string(), z.unknown()).default({}),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    address: z.string().min(1)
  })
});

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  
  // Get tenant from header
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
  }
  
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

    const { service_id, frequency, inputs, answers, customer } = parsed.data;
    
    const sb = supabaseAdmin();

    // Get service for validation and pricing
    const { data: service, error: serviceErr } = await sb
      .from("services")
      .select("id, tenant_id, name, slug, model, active, vat_rate, rut_eligible, config")
      .eq("tenant_id", tenantId)
      .eq("id", service_id)
      .eq("active", true)
      .single();

    if (serviceErr || !service) {
      return NextResponse.json({ error: "SERVICE_NOT_FOUND" }, { status: 404 });
    }

    // Server-side quote computation using stored config (prevents client tampering)
    const quote = computeQuoteV2({
      tenant: {
        currency: "SEK",
        vat_rate: service.vat_rate,
        rut_enabled: service.rut_eligible
      },
      service: service.config as ServiceConfig,
      frequency,
      inputs,
      addons: [],
      applyRUT: service.rut_eligible,
      answers
    });

    // Fast path: check for existing booking with same idempotency key
    const { data: existing, error: exErr } = await sb
      .from("bookings")
      .select("id, status, total_minor, created_at")
      .eq("tenant_id", tenantId)
      .eq("idempotency_key", idem)
      .maybeSingle();
    
    if (exErr) throw exErr;
    if (existing) {
      log("bookings.create.idempotent", { 
        tenantId, 
        serviceId: service_id,
        idempotencyKey: idem, 
        bookingId: existing.id,
        durationMs: Date.now() - t0
      });
      return NextResponse.json({
        id: existing.id,
        status: existing.status,
        total_minor: existing.total_minor,
        created_at: existing.created_at
      }, { status: 200, headers: { "Idempotency-Key": idem } });
    }

    // Create new booking
    const insertPayload = {
      tenant_id: tenantId,
      service_id: service_id,
      status: "pending" as const,
      currency: quote.currency,
      total_minor: quote.total_minor,
      vat_minor: quote.vat_minor,
      rut_minor: quote.rut_minor,
      discount_minor: quote.discount_minor,
      snapshot: quote,
      customer: customer,
      idempotency_key: idem
    };

    const { data: bookingRow, error: insertErr } = await sb
      .from("bookings")
      .insert(insertPayload)
      .select("id, status, total_minor, created_at")
      .single();

    if (insertErr) throw insertErr;

    // Log audit event
    await sb.from("audit_logs").insert({
      tenant_id: tenantId,
      action: "booking_created",
      entity: "booking",
      entity_id: bookingRow.id,
      meta: { service_id, customer_email: customer.email }
    });

    log("bookings.create.ok", {
      tenantId, 
      serviceId: service_id,
      bookingId: bookingRow.id,
      durationMs: Date.now() - t0,
      idempotencyKey: idem
    });

    return NextResponse.json({
      id: bookingRow.id,
      status: bookingRow.status,
      total_minor: bookingRow.total_minor,
      created_at: bookingRow.created_at
    }, { status: 201, headers: { "Idempotency-Key": idem } });

  } catch (error: unknown) {
    const err = error as Error;
    log("bookings.create.error", { message: err?.message, durationMs: Date.now() - t0 });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
