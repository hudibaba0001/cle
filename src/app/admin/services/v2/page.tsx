"use client";
import React, { useMemo, useState } from "react";

type Model =
  | "fixed_tier" | "tiered_multiplier" | "universal_multiplier"
  | "windows" | "per_room" | "hourly_area";

type ModifierUI = {
    key: string;
    label: string;
  answerKey: string;        // for boolean condition
  when: boolean;            // true means "answer is Yes"
  targetUI: "subtotal" | "base"; // UI choice -> api mapping
      mode: "percent" | "fixed";
  value: number;            // major units for fixed
      direction: "increase" | "decrease";
      rutEligible: boolean;
};

type FormState = {
  name: string;
  model: Model;             // <-- ensure this exact key & enum
    vatRate: number;
  rutEligible: boolean;
  minimum?: number;
  frequencyMultipliers: { one_time: number; weekly: number; biweekly: number; monthly: number };
  // model-specific inputs
  fixedTiers: { min: number; max: number; price: number }[];
  rateTiers: { min: number; max: number; ratePerSqm: number }[];
  ratePerSqm?: number;
  windowTypes: { key: string; name: string; pricePerUnit: number }[];
  roomTypes: { key: string; name: string; pricePerUnit: number }[];
  hoursPerSqm?: number;
  ratePerHour?: number;
  fees: { key: string; name: string; amount: number; rutEligible: boolean }[];
  addons: { key: string; name: string; amount: number; rutEligible: boolean }[];
  modifiers: ModifierUI[];
};

const MODEL_OPTIONS: { label: string; value: Model }[] = [
  { label: "Fixed Tier", value: "fixed_tier" },
  { label: "Tiered Multiplier", value: "tiered_multiplier" },
  { label: "Universal Multiplier", value: "universal_multiplier" },
  { label: "Windows", value: "windows" },
  { label: "Per Room", value: "per_room" },
  { label: "Hourly (area → hours)", value: "hourly_area" }, // NOT "hourly"
];

// ---- core mapper: FormState -> ServiceConfig (engine expects this shape)
function buildServiceConfig(s: FormState) {
  // shared
  const base = {
    model: s.model,
    name: s.name || "Unnamed",
    frequencyMultipliers: s.frequencyMultipliers,
    vatRate: s.vatRate ?? 25,
    rutEligible: !!s.rutEligible,
    addons: s.addons ?? [],
    fees: s.fees ?? [],
    modifiers: (s.modifiers ?? []).map(m => ({
      key: m.key,
      label: m.label || m.key,
      condition: { type: "boolean" as const, when: !!m.when, answerKey: m.answerKey },
      effect: {
        target: m.targetUI === "base" ? "base_after_frequency" : "subtotal_before_modifiers",
        mode: m.mode,
        value: Number(m.value || 0),
        direction: m.direction,
        rutEligible: !!m.rutEligible,
        label: m.label || m.key,
      }
    })),
    minimum: Number(s.minimum || 0)
  };

  // per-model specifics
  switch (s.model) {
    case "fixed_tier":
      return { ...base, tiers: s.fixedTiers };
    case "tiered_multiplier":
      return { ...base, tiers: s.rateTiers };
    case "universal_multiplier":
      return { ...base, ratePerSqm: Number(s.ratePerSqm || 0) };
    case "windows":
      return { ...base, windowTypes: s.windowTypes };
    case "per_room":
      return { ...base, roomTypes: s.roomTypes };
    case "hourly_area":
      return { ...base, areaToHours: [{ min: 0, max: 1000, hours: Number(s.hoursPerSqm || 0.1) }], hourlyRate: Number(s.ratePerHour || 0) };
  }
}

// ---- preview handler (POST /api/pricing/v2/quote)
async function previewQuote(tenantId: string, state: FormState, inputs: Record<string, unknown>, answers: Record<string, unknown>) {
  const service = buildServiceConfig(state);
  const body = {
    tenant: { currency: "SEK", vat_rate: service.vatRate, rut_enabled: service.rutEligible },
    service,
    frequency: "monthly" as const,
    inputs,
    addons: [],
    applyRUT: true,
    coupon: undefined,
    answers
  };
  const r = await fetch("/api/pricing/v2/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}

export default function ServiceBuilderV2Page() {
  const [tenant] = useState("demo-tenant");
  const [state, setState] = useState<FormState>({
    name: "Hourly demo",
    model: "hourly_area",
    vatRate: 25,
    rutEligible: true,
    minimum: 600,
    frequencyMultipliers: { one_time: 1, weekly: 1, biweekly: 1.15, monthly: 1.4 },
    fixedTiers: [], rateTiers: [], windowTypes: [], roomTypes: [],
    hoursPerSqm: 0.1, ratePerHour: 300,
    fees: [], addons: [],
    modifiers: []
  });
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<Record<string, unknown> | null>(null);

  const inputs = useMemo(() => {
    // minimal form → inputs inference, adjust per model
    if (state.model === "windows") return { counts: Object.fromEntries(state.windowTypes.map(t => [t.key, 1])) };
    if (state.model === "per_room") return { counts: Object.fromEntries(state.roomTypes.map(t => [t.key, 1])) };
    return { area: 50 }; // default for area-based models
  }, [state]);

  async function onPreview() {
    try {
      setErr(null);
      const answers: Record<string, unknown> = Object.fromEntries(
        (state.modifiers || []).map(m => [m.answerKey, m.when]) // "Yes" toggles
      );
      const j = await previewQuote(tenant, state, inputs, answers);
      setPreview(j);
    } catch (e) {
      setPreview(null); 
      setErr(e as Record<string, unknown>);
    }
  }

  // --- render trimmed UI (model select + a few fields + Preview button)
  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Model</label>
          <select className="border rounded px-2 py-1 w-full" title="Select pricing model"
            value={state.model}
            onChange={e=>setState(s=>({ ...s, model: e.target.value as Model }))}>
            {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {state.model === "universal_multiplier" && (
          <div>
            <label className="block text-sm">Rate per m²</label>
            <input type="number" className="border rounded px-2 py-1 w-full" placeholder="Enter rate per sqm"
              value={state.ratePerSqm ?? 0} onChange={e=>setState(s=>({ ...s, ratePerSqm: Number(e.target.value) }))}/>
          </div>
        )}
        {state.model === "hourly_area" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm">Hours per m²</label>
              <input type="number" className="border rounded px-2 py-1 w-full" placeholder="e.g. 0.1"
                value={state.hoursPerSqm ?? 0} onChange={e=>setState(s=>({ ...s, hoursPerSqm: Number(e.target.value) }))}/>
            </div>
            <div>
              <label className="block text-sm">Rate per hour (SEK)</label>
              <input type="number" className="border rounded px-2 py-1 w-full" placeholder="e.g. 300"
                value={state.ratePerHour ?? 0} onChange={e=>setState(s=>({ ...s, ratePerHour: Number(e.target.value) }))}/>
            </div>
          </div>
        )}
        {/* Add similar small panels for fixed_tier, tiered_multiplier, windows, per_room as needed */}
        <button onClick={onPreview} className="px-4 py-2 rounded bg-black text-white">Preview quote</button>
        {err && <pre className="text-xs text-red-600 break-words">{JSON.stringify(err, null, 2)}</pre>}
        </div>

      <div>
        <div className="text-sm text-gray-500 mb-2">Preview</div>
        {preview
          ? <pre className="text-xs bg-gray-50 p-3 rounded max-h-[70vh] overflow-auto">{JSON.stringify(preview, null, 2)}</pre>
          : <div className="text-xs text-gray-400">Run preview to see breakdown JSON</div>}
      </div>
    </div>
  );
}
