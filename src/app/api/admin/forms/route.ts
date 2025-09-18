import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";
import { FormDefinition } from "@/lib/zod/forms";

const CreateFormSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]{3,}$/),
  definition: FormDefinition,
});

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
  const url = new URL(req.url);
  const include = url.searchParams.get("include");
  const slug = url.searchParams.get("slug");
  const withDefinition = include === "definition" || include === "1";

  const sb = supabaseAdmin();
  const select = withDefinition
    ? "id, tenant_id, name, slug, status, definition, created_at, updated_at"
    : "id, tenant_id, name, slug, status, created_at, updated_at";

  let query = sb
    .from("booking_forms")
    .select(select)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (slug) {
    query = query.eq("slug", slug);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const parsed = CreateFormSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });

  const input = parsed.data;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("booking_forms")
    .insert({ tenant_id: tenantId, name: input.name, slug: input.slug, status: "draft", definition: input.definition })
    .select("id, name, slug, status, created_at")
    .single();
  if (error) {
    const status = /duplicate key|unique/i.test(error.message) ? 409 : 500;
    return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status });
  }
  return NextResponse.json(data, { status: 201 });
}


