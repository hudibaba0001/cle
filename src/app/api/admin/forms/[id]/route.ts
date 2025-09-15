import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";
import { FormDefinition } from "@/lib/zod/forms";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().regex(/^[a-z0-9-]{3,}$/).optional(),
  definition: FormDefinition.optional(),
  status: z.enum(["draft","published"]).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
  const { id } = await params;

  let json: unknown; try { json = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  const fields: Record<string, unknown> = {};
  if (typeof input.name !== "undefined") fields.name = input.name;
  if (typeof input.slug !== "undefined") fields.slug = input.slug;
  if (typeof input.definition !== "undefined") fields.definition = input.definition;
  if (typeof input.status !== "undefined") fields.status = input.status;
  if (Object.keys(fields).length === 0) return NextResponse.json({ error: "NO_FIELDS" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("booking_forms")
    .update(fields)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ id: data.id }, { status: 200 });
}


