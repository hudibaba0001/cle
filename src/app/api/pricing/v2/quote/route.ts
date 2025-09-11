import { NextRequest, NextResponse } from "next/server";
import { computeQuoteV2 } from "@/lib/pricing-v2/engine";
import { QuoteRequestSchema, ServiceConfig } from "@/lib/pricing-v2/types";
import { getFrequencyMultiplier, compileDynamicToModifiers, expandAnswersForDynamic } from "@/lib/pricing-v2/dynamic";

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
    }
    const json = await req.json();
    const parsed = QuoteRequestSchema.parse(json);
    // Merge compiled dynamic modifiers into the service modifiers
    const dyn = compileDynamicToModifiers(parsed.service as ServiceConfig);
    const mergedService = { ...(parsed.service as ServiceConfig), modifiers: [ ...(parsed.service.modifiers ?? []), ...dyn ] } as ServiceConfig;
    const freqMul = getFrequencyMultiplier(mergedService, parsed.frequency);
    const answersOverride = expandAnswersForDynamic(mergedService, (parsed as unknown as { answers?: Record<string, unknown> }).answers ?? {});
    const res = computeQuoteV2({ ...parsed, service: mergedService }, { frequencyMultiplierOverride: freqMul, answersOverride });
    return NextResponse.json(res, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "INVALID_REQUEST", details: message }, { status: 400 });
  }
}
