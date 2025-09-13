import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import AddServiceButton from "./AddServiceButton";

type ServiceRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string | null;
  model: "fixed_tier" | "tiered_multiplier" | "universal_multiplier" | "windows" | "hourly" | "per_room" | string;
  active: boolean | null;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function currencyFromConfig(cfg: Record<string, unknown> | null): string {
  return (cfg?.currency as string) ?? "SEK";
}
function minorToLabel(minor?: number | null, currency = "SEK") {
  if (minor == null) return "—";
  const abs = Math.abs(minor);
  const s = minor < 0 ? "-" : "";
  return `${s}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")} ${currency}`;
}
function deriveMinPriceMinor(cfg: Record<string, unknown> | null): number | null {
  if (!cfg) return null;
  // Prefer explicit minPriceMinor when present.
  if (typeof (cfg as any).minPriceMinor === "number") return (cfg as any).minPriceMinor;
  // For hourly model: min(areaToHours) * hourlyRate * 100 (minor units)
  const a2h = (cfg as any).areaToHours as Record<string, number> | undefined;
  const rate = (cfg as any).hourlyRate as number | undefined;
  if (a2h && rate && typeof rate === "number") {
    const hours = Math.min(...Object.values(a2h).filter((n) => typeof n === "number" && isFinite(n)));
    if (isFinite(hours)) return Math.round(hours * rate * 100);
  }
  return null;
}
function addOnsCount(cfg: Record<string, unknown> | null): number {
  const dyn = (cfg as any)?.dynamicQuestions as Array<any> | undefined;
  if (!Array.isArray(dyn)) return 0;
  // Count booleans or entries that carry a modifier (heuristic).
  return dyn.filter((q) => q && (q.type === "boolean" || q.modifier)).length;
}

export default async function ServiceManagerPage({
  searchParams,
}: {
  searchParams: { [k: string]: string | string[] | undefined };
}) {
  const supabase = supabaseAdmin();

  const { data: services, error } = await supabase
    .from("services")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<ServiceRow[]>();
  if (error) throw error;

  const total = services.length;
  const published = services.filter((s) => s.active === true).length;
  const drafts = total - published;
  const rutEligible = services.filter((s) => Boolean((s.config as any)?.rutEligible)).length;

  const saved = searchParams?.saved === "1";
  const savedId = typeof searchParams?.id === "string" ? searchParams.id : undefined;

  return (
    <div className="p-6 mx-auto max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Service Manager</h1>
          <p className="text-sm text-neutral-500">Create and manage services with pricing models and configurations</p>
        </div>
        <AddServiceButton />
      </div>

      {saved && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 text-green-800 px-4 py-3 text-sm">
          Service saved{savedId ? ` (id: ${savedId.slice(0, 8)})` : ""}. You can add more services or open the builder to continue editing.
        </div>
      )}

      {/* Summary cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Services" value={total} />
        <StatCard title="Published" value={published} />
        <StatCard title="Drafts" value={drafts} />
        <StatCard title="RUT Eligible" value={rutEligible} />
      </section>

      {/* Service cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {services.map((s) => {
          const cfg = s.config ?? {};
          const currency = currencyFromConfig(cfg);
          const minMinor = deriveMinPriceMinor(cfg);
          const addons = addOnsCount(cfg);
          const highlight = savedId && savedId === s.id;

          return (
            <article
              key={s.id}
              className={`rounded-2xl border shadow-sm p-4 ${highlight ? "ring-2 ring-blue-400" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{s.name || "(unnamed service)"}</h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-neutral-600">
                    <span className="rounded-full border px-2 py-0.5">{modelLabel(s.model)}</span>
                    {Boolean((cfg as any)?.rutEligible) && (
                      <span className="rounded-full border px-2 py-0.5">RUT</span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs rounded-full px-2 py-0.5 border ${
                    s.active ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"
                  }`}
                >
                  {s.active ? "Published" : "Draft"}
                </span>
              </div>

              <div className="mt-3 text-sm space-y-1">
                <div>Min: {minorToLabel(minMinor, currency)}</div>
                <div>⚙️ {addons} add-ons</div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Link
                  href={`/admin/services/v2?service_id=${s.id}`}
                  className="text-sm rounded-xl border px-3 py-2 hover:bg-neutral-50"
                >
                  Open Builder
                </Link>
                <Link
                  href={`/widget?service_id=${s.id}`}
                  className="text-sm rounded-xl border px-3 py-2 hover:bg-neutral-50"
                >
                  Preview in Widget
                </Link>
              </div>
            </article>
          );
        })}
        {services.length === 0 && (
          <div className="text-sm text-neutral-500">No services yet. Click "Add Service".</div>
        )}
      </section>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border shadow-sm p-4">
      <div className="text-sm text-neutral-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function modelLabel(m: string) {
  switch (m) {
    case "fixed_tier": return "Fixed Tier";
    case "tiered_multiplier": return "Tiered Multiplier";
    case "universal_multiplier": return "Universal Multiplier";
    case "windows": return "Windows";
    case "hourly": return "Hourly";
    case "per_room": return "Per Room";
    default: return m;
  }
}