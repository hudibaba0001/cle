import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { FormDefinition } from "@/lib/zod/forms";
import { ServiceConfig } from "@/lib/pricing-v2/types";
import { computeQuoteV2 } from "@/lib/pricing-v2/engine";
import { compileDynamicToModifiers, expandAnswersForDynamic, resolveFrequencyKeyOrThrow, UnknownFrequencyError, listAllowedFrequencyKeys } from "@/lib/pricing-v2/dynamic";

const Body = z.object({
  zip: z.string().min(3),
  service_id: z.string().uuid(),
  currency: z.string().default("SEK"),
  rut: z.boolean().default(true),
  frequency: z.string(),
  answers: z.record(z.string(), z.unknown()).default({}),
});

function matchesZip(zip: string, pattern: string) {
  if (pattern.endsWith("**")) return zip.startsWith(pattern.slice(0, -2));
  return zip === pattern;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
  const { slug } = await params;

  let json: unknown; try { json = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  const sb = supabaseAdmin();
  const { data: form, error } = await sb
    .from("booking_forms")
    .select("definition, status")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  if (!form) return NextResponse.json({ error: "FORM_NOT_FOUND" }, { status: 404 });

  const def = FormDefinition.parse(form.definition);
  if (def.zipValidation.enabled) {
    const ok = def.zipValidation.allow.some(p => matchesZip(body.zip, p));
    if (!ok) return NextResponse.json({ error: "ZIP_NOT_ALLOWED", message: def.zipValidation.message }, { status: 403 });
  }
  if (!def.services.ids.includes(body.service_id)) {
    return NextResponse.json({ error: "SERVICE_NOT_ALLOWED" }, { status: 400 });
  }

  // Load service and compute using the same engine as /api/public/quote
  const { data: svc } = await sb
    .from("services")
    .select("id, tenant_id, active, vat_rate, rut_eligible, config")
    .eq("tenant_id", tenantId)
    .eq("id", body.service_id)
    .eq("active", true)
    .single();
  if (!svc) return NextResponse.json({ error: "SERVICE_NOT_FOUND" }, { status: 404 });

  const rawService = svc.config as ServiceConfig;
  const dyn = compileDynamicToModifiers(rawService);
  const mergedService = { ...(rawService as ServiceConfig), modifiers: [ ...(rawService.modifiers ?? []), ...dyn ] } as ServiceConfig;
  let freqMul: number;
  try {
    freqMul = resolveFrequencyKeyOrThrow(mergedService, body.frequency);
  } catch (e: unknown) {
    if (e instanceof UnknownFrequencyError) {
      return NextResponse.json({ error: "UNKNOWN_FREQUENCY", allowed: listAllowedFrequencyKeys(mergedService) }, { status: 400 });
    }
    throw e;
  }
  const answersOverride = expandAnswersForDynamic(mergedService, body.answers as Record<string, unknown>);
  const quote = computeQuoteV2({
    tenant: { currency: body.currency, vat_rate: svc.vat_rate, rut_enabled: svc.rut_eligible },
    service: mergedService,
    frequency: body.frequency,
    inputs: {},
    addons: [],
    applyRUT: body.rut,
    answers: body.answers,
  }, { frequencyMultiplierOverride: freqMul, answersOverride });
  return NextResponse.json(quote, { status: 200 });
}


