import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const Body = z.object({ reason: z.string().min(2).max(500) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });

  const resolvedParams = await params;
  const idem = (req.headers.get("idempotency-key") || "").trim();
  if (!idem) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const bodyJson = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(bodyJson);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: current, error: cErr } = await sb.from("bookings")
    .select("id, status, reject_reason")
    .eq("tenant_id", tenantId).eq("id", resolvedParams.id).maybeSingle();
  if (cErr) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (current.status === "rejected") {
    return NextResponse.json({ 
      id: resolvedParams.id, 
      status: "rejected", 
      reject_reason: current.reject_reason 
    }, { status: 200, headers: { "Idempotency-Key": idem } });
  }
  if (current.status !== "pending") {
    return NextResponse.json({ error: "INVALID_STATE", message: `Cannot reject from ${current.status}` }, { status: 409 });
  }

  const { data: upd, error: uErr } = await sb.from("bookings")
    .update({ status: "rejected", reject_reason: parsed.data.reason })
    .eq("tenant_id", tenantId)
    .eq("id", resolvedParams.id)
    .eq("status", "pending")
    .select("id, status, reject_reason")
    .maybeSingle();
  if (uErr) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!upd) return NextResponse.json({ error: "CONFLICT", message: "Booking updated by another process" }, { status: 409 });

  // Audit
  await sb.from("audit_logs").insert({
    tenant_id: tenantId,
    action: "booking_rejected",
    entity: "booking",
    entity_id: upd.id,
    meta: { reason: parsed.data.reason }
  });

  return NextResponse.json(upd, { status: 200, headers: { "Idempotency-Key": idem } });
}
