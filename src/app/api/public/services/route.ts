import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const Q = z.object({ tenantSlug: z.string().min(1) });

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = Q.safeParse({ tenantSlug: url.searchParams.get("tenantSlug") ?? "" });
  if (!q.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: tenant, error: tErr } = await sb
    .from("tenants")
    .select("id, slug, name, currency, vat_rate, rut_enabled, is_active")
    .eq("slug", q.data.tenantSlug)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!tenant || !tenant.is_active) return NextResponse.json({ error: "TENANT_NOT_FOUND_OR_INACTIVE" }, { status: 404 });

  // Return only what's needed for widget rendering
  const { data: services, error: sErr } = await sb
    .from("services")
    .select("key, name, model, is_public, is_active, config, schema_version, updated_at")
    .eq("tenant_id", tenant.id)
    .eq("is_public", true)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (sErr) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  // Sanitize config to the subset the widget needs to render inputs/add-ons
  const items = (services ?? []).map(s => {
    const cfg = s.config || {};
    return {
      key: s.key,
      name: s.name,
      model: s.model as "per_sqm"|"hourly"|"fixed"|"per_room"|"windows",
      // Only the parts required client-side for rendering
      ui: {
        expects: s.model === "per_sqm" ? ["sqm"] : s.model === "hourly" ? ["hours"] : [],
        addons: (cfg.addons ?? []).map((a: any) => ({
          key: a.key, name: a.name, type: a.type, amount: a.amount
        })),
        frequency: cfg.frequency_multipliers ?? { one_time: 1.0, monthly: 0.9, biweekly: 0.85, weekly: 0.8 },
        rutEnabled: Boolean(cfg.rut?.enabled)
      }
    };
  });

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      currency: tenant.currency,
      vat_rate: tenant.vat_rate,
      rut_enabled: tenant.rut_enabled
    },
    services: items
  });
}
