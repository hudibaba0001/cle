import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import type { ServiceConfigV1 } from "@/packages/pricing/types";

// TEMP: use Demo tenant until impersonation is ready
const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";

const CreateSchema = z.object({
  key: z.string().min(2).regex(/^[a-z0-9_:-]+$/),
  name: z.string().min(2),
  model: z.enum(["fixed","hourly","per_sqm","per_room","windows"]),
  config: z.any(), // validated shallowly; pricing engine expects ServiceConfigV1
  is_public: z.boolean().default(true),
  is_active: z.boolean().default(true)
});

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("services")
    .select("tenant_id, key, name, model, is_public, is_active, schema_version, updated_at")
    .eq("tenant_id", DEMO_TENANT)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const bodyRaw = await req.json();
    const parsed = CreateSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
    }
    // Basic sanity for config
    const cfg = parsed.data.config as ServiceConfigV1;
    if (parsed.data.model === "per_sqm" && !((cfg.tiers && cfg.tiers.length) || cfg.base_per_sqm)) {
      return NextResponse.json({ error: "CONFIG_ERROR", message: "per_sqm requires tiers or base_per_sqm" }, { status: 400 });
    }
    if (parsed.data.model === "hourly" && !cfg.hourly_rate) {
      return NextResponse.json({ error: "CONFIG_ERROR", message: "hourly requires hourly_rate" }, { status: 400 });
    }
    if (parsed.data.model === "fixed" && !cfg.fixed_amount) {
      return NextResponse.json({ error: "CONFIG_ERROR", message: "fixed requires fixed_amount" }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("services")
      .insert({
        tenant_id: DEMO_TENANT,
        key: parsed.data.key,
        name: parsed.data.name,
        model: parsed.data.model,
        config: parsed.data.config,
        is_public: parsed.data.is_public,
        is_active: parsed.data.is_active
      })
      .select("id, key, name, model")
      .maybeSingle();
    if (error) throw error;

    log("admin.services.create.ok", { key: data?.key, durationMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, item: data }, { status: 201 });
  } catch (e: unknown) {
    const error = e as Error;
    log("admin.services.create.error", { message: error?.message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
