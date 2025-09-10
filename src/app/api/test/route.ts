import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    // Test Supabase connection
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("tenants")
      .select("id, name, slug")
      .limit(1)
      .single();

    if (error) {
      return NextResponse.json({ 
        status: "error", 
        message: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      status: "ok", 
      supabase_connected: true,
      sample_tenant: data,
      env_check: {
        has_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ 
      status: "error", 
      message: err.message,
      env_check: {
        has_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    }, { status: 500 });
  }
}
