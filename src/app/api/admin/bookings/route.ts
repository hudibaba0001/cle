import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("bookings")
    .select("id, status, currency, total_minor, vat_minor, rut_minor, discount_minor, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] }, { status: 200 });
}