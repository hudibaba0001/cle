import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import type { ServiceConfigV1 } from "@/packages/pricing/types";

interface Params {
  id: string;
}

// TEMP: use Demo tenant until impersonation is ready
const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";

const UpdateSchema = z.object({
  name: z.string().min(2).optional(),
  model: z.enum(["fixed","hourly","per_sqm","per_room","windows"]).optional(),
  config: z.any().optional(), // validated shallowly; pricing engine expects ServiceConfigV1
  is_public: z.boolean().optional(),
  is_active: z.boolean().optional()
});

export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("tenant_id", DEMO_TENANT)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { id } = await params;
  const t0 = Date.now();
  try {
    const bodyRaw = await req.json();
    const parsed = UpdateSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
    }
    
    // Basic sanity for config if provided
    if (parsed.data.config) {
      const cfg = parsed.data.config as ServiceConfigV1;
      const model = parsed.data.model;
      if (model === "per_sqm" && !((cfg.tiers && cfg.tiers.length) || cfg.base_per_sqm)) {
        return NextResponse.json({ error: "CONFIG_ERROR", message: "per_sqm requires tiers or base_per_sqm" }, { status: 400 });
      }
      if (model === "hourly" && !cfg.hourly_rate) {
        return NextResponse.json({ error: "CONFIG_ERROR", message: "hourly requires hourly_rate" }, { status: 400 });
      }
      if (model === "fixed" && !cfg.fixed_amount) {
        return NextResponse.json({ error: "CONFIG_ERROR", message: "fixed requires fixed_amount" }, { status: 400 });
      }
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("services")
      .update(parsed.data)
      .eq("tenant_id", DEMO_TENANT)
      .eq("id", id)
      .select("id, key, name, model")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    log("admin.services.update.ok", { id, durationMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, item: data });
  } catch (e: unknown) {
    const error = e as Error;
    log("admin.services.update.error", { message: error?.message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { id } = await params;
  const t0 = Date.now();
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("services")
      .delete()
      .eq("tenant_id", DEMO_TENANT)
      .eq("id", id)
      .select("id, key")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    log("admin.services.delete.ok", { id, key: data.key, durationMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, deleted: data });
  } catch (e: unknown) {
    const error = e as Error;
    log("admin.services.delete.error", { message: error?.message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
