import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeQuoteV2 } from "@/lib/pricing-v2/engine";
import { FrequencyKey, QuoteRequest, ServiceConfig } from "@/lib/pricing-v2/types";
import { getFrequencyMultiplier, compileDynamicToModifiers, expandAnswersForDynamic } from "@/lib/pricing-v2/dynamic";
// removed unused import

const Body = z.object({
  tenant: z.object({
    currency: z.string().default("SEK"),
    vat_rate: z.number().min(0).max(100).default(25),
    rut_enabled: z.boolean().default(false),
  }),
  service_id: z.string().uuid(),
  frequency: FrequencyKey.default("one_time"),
  inputs: z.record(z.string(), z.unknown()).default({}),
  addons: z.array(z.object({ key: z.string(), quantity: z.number().int().positive().optional() })).default([]),
  applyRUT: z.boolean().default(false),
  coupon: z.object({ code: z.string(), type: z.enum(["percent","fixed"]), value: z.number().positive() }).optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const sb = supabaseAdmin();
  const { data: svc, error } = await sb
    .from("services")
    .select("id, tenant_id, config")
    .eq("tenant_id", tenantId)
    .eq("id", body.service_id)
    .single();
  if (error || !svc) return NextResponse.json({ error: "SERVICE_NOT_FOUND" }, { status: 404 });

  const rawService = svc.config as ServiceConfig;
  const dyn = compileDynamicToModifiers(rawService);
  const mergedService = { ...(rawService as ServiceConfig), modifiers: [ ...(rawService.modifiers ?? []), ...dyn ] } as ServiceConfig;
  const freqMul = getFrequencyMultiplier(mergedService, body.frequency);
  const answersOverride = expandAnswersForDynamic(mergedService, body.answers as Record<string, unknown>);

  // Server-side pricing using stored config prevents client tampering
  const quote = computeQuoteV2({
    tenant: body.tenant,
    service: mergedService,
    frequency: body.frequency,
    inputs: body.inputs as QuoteRequest["inputs"],
    addons: body.addons,
    applyRUT: body.applyRUT,
    coupon: body.coupon,
    answers: body.answers,
  }, { frequencyMultiplierOverride: freqMul, answersOverride });
  return NextResponse.json(quote, { status: 200 });
}
