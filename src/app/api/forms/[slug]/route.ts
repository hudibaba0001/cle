import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
  const { slug } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("booking_forms")
    .select("name, slug, status, definition")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "FORM_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(data, { status: 200 });
}


