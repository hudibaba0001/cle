import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ServiceConfigSchema } from "@/schemas/service";
import { supabaseAdmin as createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
  const { id } = await params;
  const sb = createServerClient();
  const { data, error } = await sb
    .from("services")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(data, { status: 200 });
}

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().regex(/^[a-z0-9-]{3,}$/).optional(),
  active: z.boolean().optional(),
  config: ServiceConfigSchema.optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 401 });
  const { id } = await params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // If config provided, we already validated against schema via Zod
  const fields: Record<string, unknown> = {};
  if (typeof input.name !== "undefined") fields.name = input.name;
  if (typeof input.slug !== "undefined") fields.slug = input.slug;
  if (typeof input.active !== "undefined") fields.active = input.active;
  if (typeof input.config !== "undefined") {
    // Scrub any legacy zip fields from config before persisting
    const cfg: Record<string, unknown> = { ...(input.config as Record<string, unknown>) };
    delete cfg["zip"]; delete cfg["zipAllowlist"]; delete cfg["zipRules"];
    fields.vat_rate = (cfg["vatRate"] as number | undefined);
    fields.rut_eligible = (cfg["rutEligible"] as boolean | undefined);
    fields.model = (cfg["model"] as string | undefined);
    fields.config = cfg;
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "NO_FIELDS" }, { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from("services")
    .update(fields)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    const status = /duplicate key|unique/i.test(error.message) ? 409 : 500;
    return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status });
  }
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ id: data.id }, { status: 200 });
}
