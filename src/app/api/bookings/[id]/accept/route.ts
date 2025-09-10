import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { log } from "@/lib/log";

const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";
const Body = z.object({
  scheduled_start: z.string().datetime().optional(),
  scheduled_end: z.string().datetime().optional(),
  estimated_hours: z.number().positive().max(200).optional()
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const idem = (req.headers.get("idempotency-key") || "").trim();
  if (!idem) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const bodyJson = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(bodyJson);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });

  const sb = supabaseAdmin();

  // Read current state
  const { data: current, error: cErr } = await sb.from("bookings")
    .select("id, status")
    .eq("tenant_id", DEMO_TENANT).eq("id", resolvedParams.id).maybeSingle();
  if (cErr) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Idempotent-by-state: if already accepted, return as-is (200)
  if (current.status === "accepted") {
    log("bookings.accept.idempotent", { bookingId: resolvedParams.id });
    return NextResponse.json({ 
      id: resolvedParams.id, 
      status: "accepted"
    }, { status: 200, headers: { "Idempotency-Key": idem } });
  }
  if (current.status !== "pending") {
    return NextResponse.json({ error: "INVALID_STATE", message: `Cannot accept from ${current.status}` }, { status: 409 });
  }

  // Update guarded by WHERE status='pending'  
  const updateData: Record<string, unknown> = {
    status: "accepted"
  };
  
  if (parsed.data.scheduled_start) updateData.scheduled_start = parsed.data.scheduled_start;
  if (parsed.data.scheduled_end) updateData.scheduled_end = parsed.data.scheduled_end;  
  if (parsed.data.estimated_hours) updateData.estimated_hours = parsed.data.estimated_hours;

  const { data: upd, error: uErr } = await sb.from("bookings")
    .update(updateData)
    .eq("tenant_id", DEMO_TENANT)
    .eq("id", resolvedParams.id)
    .eq("status", "pending")
    .select("id, status")
    .maybeSingle();
  if (uErr) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  if (!upd) return NextResponse.json({ error: "CONFLICT", message: "Booking updated by another process" }, { status: 409 });

  log("bookings.accept.ok", { bookingId: resolvedParams.id });
  return NextResponse.json(upd, { status: 200, headers: { "Idempotency-Key": idem } });
}
