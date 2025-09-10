import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { QuoteRequestSchema } from "@/packages/pricing/types";
import { computeQuote } from "@/packages/pricing";
import type { ServiceConfigV1 } from "@/packages/pricing/types";

const dbTenant = z.object({
  id: z.string().length(36).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  currency: z.string().min(1),
  vat_rate: z.number(),
  rut_enabled: z.boolean(),
  is_active: z.boolean()
});

const dbService = z.object({
  id: z.string().length(36).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  model: z.enum(["fixed","hourly","per_sqm","per_room","windows"]),
  schema_version: z.number(),
  config: z.any(),
  is_active: z.boolean()
});

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const idem = req.headers.get("idempotency-key") ?? undefined;
  try {
    const json = await req.json();
    const parsed = QuoteRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
    }
    const body = { ...parsed.data, idempotencyKey: parsed.data.idempotencyKey ?? idem };

    const sb = supabaseAdmin();

    const { data: tenantRow, error: tErr } = await sb
      .from("tenants")
      .select("id, currency, vat_rate, rut_enabled, is_active")
      .eq("id", body.tenantId)
      .maybeSingle();

    if (tErr) throw tErr;
    const tenant = dbTenant.parse(tenantRow);
    if (!tenant.is_active) return NextResponse.json({ error: "TENANT_INACTIVE" }, { status: 403 });

    const { data: serviceRow, error: sErr } = await sb
      .from("services")
      .select("id, model, schema_version, config, is_active")
      .eq("tenant_id", tenant.id)
      .eq("key", body.serviceKey)
      .maybeSingle();

    if (sErr) throw sErr;
    const service = dbService.parse(serviceRow);
    if (!service.is_active) return NextResponse.json({ error: "SERVICE_INACTIVE" }, { status: 404 });

    const quote = computeQuote({
      req: body,
      tenant: {
        currency: tenant.currency,
        vat_rate: tenant.vat_rate,
        rut_enabled: tenant.rut_enabled
      },
      service: {
        model: service.model,
        schemaVersion: service.schema_version,
        config: service.config as ServiceConfigV1,
        name: body.serviceKey
      }
    });

    const durationMs = Date.now() - t0;
    log("pricing.quote.ok", {
      tenantId: body.tenantId,
      serviceKey: body.serviceKey,
      durationMs,
      idempotencyKey: body.idempotencyKey,
      total: quote.total
    });

    return NextResponse.json(quote, { status: 200, headers: idem ? { "Idempotency-Key": idem } : undefined });
  } catch (e: unknown) {
    const durationMs = Date.now() - t0;
    const error = e as Error;
    log("pricing.quote.error", { message: error?.message, durationMs });
    const status = Number.isInteger((e as { status?: number })?.status) ? (e as { status: number }).status : 500;
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status });
  }
}
