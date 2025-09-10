import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";

const Q = z.object({
  status: z.enum(["pending","accepted","rejected","cancelled","expired"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = Q.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    page: url.searchParams.get("page") ?? "1",
    pageSize: url.searchParams.get("pageSize") ?? "20"
  });
  if (!parsed.success) return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  const { status, page, pageSize } = parsed.data;
  const from = (page-1)*pageSize;
  const to = from + pageSize - 1;

  const sb = supabaseAdmin();
  let query = sb.from("bookings")
    .select("id, status, service_key, amount_due_minor, created_at, customer_email, address_zip", { count: "exact" })
    .eq("tenant_id", DEMO_TENANT)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  
  // Transform data to match expected format
  const items = (data ?? []).map(item => ({
    ...item,
    email: item.customer_email,
    zip: item.address_zip
  }));
  
  return NextResponse.json({ items, page, pageSize, total: count ?? 0 });
}
