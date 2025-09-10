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

    // Create booking record
    const { data: booking, error: bookingErr } = await sb
      .from("bookings")
      .insert({
        tenant_id: quoteReq.tenantId,
        service_key: quoteReq.serviceKey,
        quote_request: quoteReq,
        quote_response: quote,
        amount_due_minor: Math.round(quote.total * 100), // Convert to minor units
        customer_email: customer.email,
        customer_phone: customer.phone,
        address_zip: address.zip,
        address_street: address.street,
        address_city: address.city
      })
      .select("id, status, created_at")
      .single();

    if (bookingErr) throw bookingErr;

    log("bookings.create.ok", { 
      id: booking.id, 
      tenantId: quoteReq.tenantId, 
      serviceKey: quoteReq.serviceKey,
      amountMinor: Math.round(quote.total * 100),
      durationMs: Date.now() - t0 
    });

    return NextResponse.json({ 
      ok: true,
      id: booking.id,
      status: booking.status,
      amount_due_minor: Math.round(quote.total * 100),
      created_at: booking.created_at
    }, { status: 201 });

  } catch (error: unknown) {
    const err = error as Error;
    log("bookings.create.error", { message: err?.message, durationMs: Date.now() - t0 });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
