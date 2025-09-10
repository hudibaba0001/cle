import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    const sb = supabaseAdmin();
    
    const { data, error } = await sb
      .from("bookings")
      .select("id, status, service_key, subtotal_ex_vat_minor, vat_minor, rut_minor, amount_due_minor, created_at")
      .eq("tenant_id", "00000000-0000-0000-0000-000000000001")
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) throw error;

    return NextResponse.json({ bookings: data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
