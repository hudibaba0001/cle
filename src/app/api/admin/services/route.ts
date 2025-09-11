import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CreateServiceSchema } from "@/schemas/service";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("services")
    .select("id, tenant_id, name, slug, model, active, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = CreateServiceSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const slug = input.slug ?? slugify(input.name);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("services")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      slug,
      active: input.active,
      vat_rate: input.config.vatRate,
      rut_eligible: input.config.rutEligible,
      model: input.config.model,
      config: input.config,
    })
    .select("id, tenant_id, name, slug, model, active, created_at")
    .single();

  if (error) {
    const status = /duplicate key|unique/i.test(error.message) ? 409 : 500;
    return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status });
  }

  return NextResponse.json({
    id: data.id,
    tenant_id: data.tenant_id,
    name: data.name,
    slug: data.slug,
    model: data.model,
    active: data.active,
    created_at: data.created_at,
  }, { status: 201 });
}
