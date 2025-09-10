import { NextRequest, NextResponse } from "next/server";
import { computeQuoteV2 } from "@/lib/pricing-v2/engine";
import { QuoteRequestSchema } from "@/lib/pricing-v2/types";

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
    }
    const json = await req.json();
    const parsed = QuoteRequestSchema.parse(json);
    const res = computeQuoteV2(parsed);
    return NextResponse.json(res, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "INVALID_REQUEST", details: message }, { status: 400 });
  }
}
