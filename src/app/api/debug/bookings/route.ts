import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    
    const { searchParams } = new URL(req.url);
    const idempotencyKey = searchParams.get("idempotencyKey");
    
    let query = sb
      .from("bookings")
      .select("id, status, service_key, amount_due_minor, idempotency_key, created_at")
      .eq("tenant_id", "00000000-0000-0000-0000-000000000001")
      .order("created_at", { ascending: false });

    if (idempotencyKey) {
      query = query.eq("idempotency_key", idempotencyKey);
    } else {
      query = query.limit(5);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ bookings: data });
  } catch (error) {
    console.error("Debug bookings error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : String(error),
      details: error
    }, { status: 500 });
  }
}
