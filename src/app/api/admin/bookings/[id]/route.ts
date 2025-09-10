import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("bookings")
    .select("id, status, service_key, quote_request, quote_response, customer_email, customer_phone, address_zip, address_street, address_city, reject_reason, amount_due_minor, created_at")
    .eq("tenant_id", DEMO_TENANT)
    .eq("id", resolvedParams.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  
  // Transform data to match expected format
  const item = {
    ...data,
    customer: {
      email: data.customer_email,
      phone: data.customer_phone
    },
    address: {
      zip: data.address_zip,
      street: data.address_street,
      city: data.address_city
    },
    service_snapshot: {
      key: data.service_key,
      quote_request: data.quote_request
    },
    price_snapshot: data.quote_response
  };
  
  return NextResponse.json({ item });
}
