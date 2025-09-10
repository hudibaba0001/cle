import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeQuoteV2 } from "@/lib/pricing-v2/engine";
import { ServiceConfig } from "@/lib/pricing-v2/types";

const Coupon = z.object({
  code: z.string(),
  type: z.enum(["percent","fixed"]),
  value: z.number().positive()
}).optional();

const Req = z.object({
  tenant: z.object({ currency: z.string().default("SEK"), vat_rate: z.number().min(0).max(100).default(25), rut_enabled: z.boolean().default(false) }),
  service: ServiceConfig,
  frequency: z.string().default("one_time"),
  inputs: z.any().default({}),
  addons: z.array(z.object({ key: z.string(), quantity: z.number().int().positive().optional() })).default([]),
  applyRUT: z.boolean().default(false),
  coupon: Coupon
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = Req.parse(json);
    const res = computeQuoteV2(parsed);
    return NextResponse.json(res, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "INVALID_REQUEST", details: message }, { status: 400 });
  }
}
