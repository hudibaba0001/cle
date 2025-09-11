import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Public catalog for a tenant by x-tenant-id header.
// Returns active services with config needed to render the widget inputs.
export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });

  const sb = supabaseAdmin();

  const { data: services, error } = await sb
    .from("services")
    .select("id, name, model, active, config, vat_rate, rut_eligible, updated_at")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });

  return NextResponse.json({
    items: (services ?? []).map(s => ({
      id: s.id,
      name: s.name,
      model: s.model,
      config: s.config, // used to render fields like modifiers, window/room types
      vatRate: s.vat_rate,
      rutEligible: s.rut_eligible
    }))
  }, { status: 200 });
}
