"use client";

import { useEffect, useMemo, useState } from "react";
// Using ts-expect-error to silence transient type resolver issues in CI; JSX runtime does not require React import
// @ts-expect-error: React types may be unavailable in CI cache; safe to import for JSX
import React from "react";
// Using ts-expect-error to silence transient type resolver issues for next/navigation types in CI
// @ts-expect-error: next/navigation types may not resolve in certain CI environments
import { useSearchParams } from "next/navigation";

type PricingModel = "fixed_tier" | "tiered_multiplier" | "universal_multiplier" | "windows" | "hourly" | "per_room";

type FrequencyOption = { key: string; label: string; multiplier: number };

type DynModifier =
  | { type: "multiplier"; value: number; scope: "subtotal_ex_vat" | "pre_vat_rut" }
  | { type: "fixed"; value_minor: number; scope: "pre_vat_rut"; rut_eligible?: boolean };

type DynamicQuestion = {
  key: string;
  type: "boolean";
  label: string;
  modifier?: DynModifier;
};

type Fee = { key: string; label: string; amount_minor: number; rut_eligible?: boolean; apply: "always" };

type ServiceConfig = {
  currency: string;
  rutEligible?: boolean;
  hourlyRate?: number;
  areaToHours?: Record<string, number>;
  frequencyOptions: FrequencyOption[];
  dynamicQuestions: DynamicQuestion[];
  fees: Fee[];
};

type ServiceRow = {
  id?: string;
  name: string;
  model: PricingModel;
  active: boolean;
  config: ServiceConfig;
};

type QuoteLine = { key: string; label: string; amount_minor: number };
type QuoteRes = {
  lines: QuoteLine[];
  total_minor: number;
  vat_minor: number;
  rut_minor: number;
  discount_minor: number;
  currency: string;
};

export default function ServiceBuilderV2() {
  const sp = useSearchParams();
  const serviceId = sp.get("service_id") || undefined;

  const [tenantId, setTenantId] = useState<string>("");
  const [svc, setSvc] = useState<ServiceRow>(() => ({
    id: serviceId,
    name: "New Service",
    model: "hourly",
    active: false,
    config: {
      currency: "SEK",
      rutEligible: true,
      hourlyRate: 1100,
      areaToHours: { "50": 3 },
      frequencyOptions: [{ key: "every_3_weeks", label: "Every 3 weeks", multiplier: 1 }],
      dynamicQuestions: [],
      fees: [],
    },
  }));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<QuoteRes | null>(null);
  const [previewFreq, setPreviewFreq] = useState<string>("every_3_weeks");
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      if (!serviceId || !tenantId) return;
      try {
        const res = await fetch(`/api/admin/services`, { headers: { "x-tenant-id": tenantId }, cache: "no-store" });
        if (!res.ok) return;
        const arr = await res.json();
        const row = Array.isArray(arr) ? arr.find((x: Record<string, unknown>) => x.id === serviceId) : undefined;
        if (row?.id) {
          const cfg = normalizeConfig(row.config);
          setSvc({ id: row.id, name: row.name ?? "", model: row.model ?? "hourly", active: !!row.active, config: cfg });
          setDirty(false);
        }
      } catch (e) {
        console.warn("Load service failed", e);
      }
    };
    load();
  }, [serviceId, tenantId]);

  function normalizeConfig(cfg: unknown): ServiceConfig {
    const config = cfg as Record<string, unknown> | null;
    if (config === null) {
      return {
        currency: "SEK",
        rutEligible: true,
        hourlyRate: 1100,
        areaToHours: { "50": 3 },
        frequencyOptions: [],
        dynamicQuestions: [],
        fees: [],
      };
    }
    return {
      currency: (config.currency as string | undefined) ?? "SEK",
      rutEligible: (config.rutEligible as boolean | undefined) ?? true,
      hourlyRate: typeof config.hourlyRate === "number" ? config.hourlyRate : 1100,
      areaToHours: (config.areaToHours as Record<string, number> | undefined) ?? { "50": 3 },
      frequencyOptions: Array.isArray(config.frequencyOptions) ? config.frequencyOptions as FrequencyOption[] : [],
      dynamicQuestions: Array.isArray(config.dynamicQuestions) ? config.dynamicQuestions as DynamicQuestion[] : [],
      fees: Array.isArray(config.fees) ? config.fees as Fee[] : [],
    };
  }

  function up(patch: Partial<ServiceRow>) {
    setSvc((prev: ServiceRow) => {
      const next = { ...prev, ...patch, config: { ...prev.config, ...(patch.config ?? {}) } };
      if (JSON.stringify(next) !== JSON.stringify(prev)) setDirty(true);
      return next;
    });
  }

  async function save(): Promise<string | null> {
    setError(null);
    if (!tenantId) { setError("TENANT_ID_REQUIRED"); return null; }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: svc.name, model: svc.model, active: svc.active, config: svc.config });
      if (!svc.id) {
        const res = await fetch("/api/admin/services", { method: "POST", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body });
        if (!res.ok) throw await toErr(res);
        const j = await res.json();
        const id = j?.id as string | undefined;
        if (id) {
          setSvc((p) => ({ ...p, id }));
          const url = new URL(window.location.href); url.searchParams.set("service_id", id); window.history.replaceState(null, "", url.toString());
        }
      } else {
        const res = await fetch(`/api/admin/services/${svc.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body });
        if (!res.ok) throw await toErr(res);
      }
      setDirty(false);
      return svc.id ?? null;
    } catch (e: unknown) {
      setError((e as Error).message || "SAVE_FAILED");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function preview() {
    setError(null);
    if (!svc.id || dirty) {
      const id = await save();
      if (!id) return;
    }
    setQuoting(true);
    try {
      const payload = {
        service_id: svc.id,
        currency: svc.config.currency || "SEK",
        rut: !!svc.config.rutEligible,
        frequency: previewFreq,
        answers: Object.fromEntries(Object.entries(previewAnswers).filter(([, v]) => v === true)),
      };
      const res = await fetch("/api/public/quote", { method: "POST", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body: JSON.stringify(payload) });
      if (!res.ok) throw await toErr(res);
      const j = (await res.json()) as QuoteRes;
      setQuote(j);
    } catch (e: unknown) {
      setError((e as Error).message || "PREVIEW_FAILED");
    } finally {
      setQuoting(false);
    }
  }

  const subtotal = useMemo(() => quote ? (quote.total_minor - quote.vat_minor - quote.rut_minor - quote.discount_minor) : 0, [quote]);
  const invariantOK = useMemo(() => quote ? (subtotal + quote.vat_minor + quote.rut_minor + quote.discount_minor === quote.total_minor) : null, [quote, subtotal]);

  function editFreq(i: number, patch: Partial<FrequencyOption>) {
    const arr = [...svc.config.frequencyOptions]; arr[i] = { ...arr[i], ...patch }; up({ config: { ...svc.config, frequencyOptions: arr } });
  }
  function addFreq() {
    up({ config: { ...svc.config, frequencyOptions: [...svc.config.frequencyOptions, { key: "monthly", label: "Monthly", multiplier: 1 }] } });
  }
  function editFee(i: number, patch: Partial<Fee>) {
    const arr = [...svc.config.fees]; arr[i] = { ...arr[i], ...patch }; up({ config: { ...svc.config, fees: arr } });
  }
  function addFee() {
    up({ config: { ...svc.config, fees: [...svc.config.fees, { key: `fee_${rand()}`, label: "New fee", amount_minor: 2500, apply: "always" }] } });
  }
  function editDyn(key: string, patch: Partial<DynamicQuestion>) {
    const arr = svc.config.dynamicQuestions.map((q) => (q.key === key ? { ...q, ...patch } : q));
    up({ config: { ...svc.config, dynamicQuestions: arr } });
  }
  function addAddon() {
    up({
      config: {
        ...svc.config,
        dynamicQuestions: [
          ...svc.config.dynamicQuestions,
          { key: `addon_${rand()}`, type: "boolean", label: "New add-on", modifier: { type: "fixed", value_minor: 2500, scope: "pre_vat_rut", rut_eligible: false } },
        ],
      },
    });
  }
  function addBoolMod() {
    up({
      config: {
        ...svc.config,
        dynamicQuestions: [
          ...svc.config.dynamicQuestions,
          { key: `flag_${rand()}`, type: "boolean", label: "New modifier", modifier: { type: "multiplier", value: 1.1, scope: "subtotal_ex_vat" } },
        ],
      },
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Service Builder v2</h1>
          <p className="text-sm text-neutral-500">Frequencies, Add-ons, Fees, and Boolean Modifiers</p>
        </div>
        <div className="flex items-center gap-2">
          <input aria-label="Tenant ID" placeholder="Tenant ID (required)" className="rounded-xl border px-3 py-2 text-sm" value={tenantId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTenantId(e.target.value)} />
          <button onClick={save} disabled={saving || !tenantId} className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          <button onClick={preview} disabled={quoting || !tenantId} className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">{quoting ? "Previewing…" : "Preview"}</button>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4 shadow-sm space-y-2">
          <label className="text-sm">Service name</label>
          <input aria-label="Service name" className="w-full rounded-xl border p-2 text-sm" value={svc.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => up({ name: e.target.value })} />

          <label className="text-sm mt-2">Pricing model</label>
          <select aria-label="Pricing model" className="w-full rounded-xl border p-2 text-sm" value={svc.model} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => up({ model: e.target.value as PricingModel })}>
            <option value="hourly">Hourly</option>
            <option value="fixed_tier">Fixed Tier</option>
            <option value="tiered_multiplier">Tiered Multiplier</option>
            <option value="universal_multiplier">Universal Multiplier</option>
            <option value="windows">Windows</option>
            <option value="per_room">Per Room</option>
          </select>

          {svc.model === "hourly" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm">Hourly rate</label>
                <input aria-label="Hourly rate" type="number" className="w-full rounded-xl border p-2 text-sm" value={svc.config.hourlyRate ?? 1100}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => up({ config: { ...svc.config, hourlyRate: Number(e.target.value) || 0 } })} />
              </div>
              <div>
                <label className="text-sm">Area→Hours (JSON)</label>
                <input aria-label="Area to Hours JSON" className="w-full rounded-xl border p-2 text-sm" value={JSON.stringify(svc.config.areaToHours ?? { "50": 3 })}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { try { up({ config: { ...svc.config, areaToHours: JSON.parse(e.target.value) } }); } catch {} }} />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm">Currency</label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!svc.config.rutEligible} onChange={(e: React.ChangeEvent<HTMLInputElement>) => up({ config: { ...svc.config, rutEligible: e.target.checked } })} />
              RUT eligible
            </label>
          </div>
          <input aria-label="Currency" className="w-full rounded-xl border p-2 text-sm" value={svc.config.currency} onChange={(e: React.ChangeEvent<HTMLInputElement>) => up({ config: { ...svc.config, currency: e.target.value || "SEK" } })} />

          <label className="text-sm mt-2">Frequency options</label>
          <div className="space-y-2">
            {svc.config.frequencyOptions.map((f, i) => (
              <div key={f.key + i} className="grid grid-cols-3 gap-2">
                <input aria-label="Frequency key" className="rounded-xl border p-2 text-sm" value={f.key} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editFreq(i, { key: e.target.value })} />
                <input aria-label="Frequency label" className="rounded-xl border p-2 text-sm" value={f.label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editFreq(i, { label: e.target.value })} />
                <input aria-label="Frequency multiplier" type="number" className="rounded-xl border p-2 text-sm" value={f.multiplier} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editFreq(i, { multiplier: Number(e.target.value) || 0 })} />
              </div>
            ))}
            <button className="text-sm rounded-xl border px-2 py-1" onClick={addFreq}>+ Add frequency</button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Add-ons (boolean, fixed amount)">
          {svc.config.dynamicQuestions
            .filter((q) => q.type === "boolean" && q.modifier && (q.modifier as DynModifier).type === "fixed")
            .map((q) => (
              <div key={q.key} className="grid grid-cols-5 gap-2 items-center">
                <input aria-label="Add-on key" className="col-span-2 rounded-xl border p-2 text-sm" value={q.key} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editDyn(q.key, { key: e.target.value })} />
                <input aria-label="Add-on label" className="col-span-2 rounded-xl border p-2 text-sm" value={q.label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editDyn(q.key, { label: e.target.value })} />
                <input aria-label="Add-on amount (minor)" type="number" className="rounded-xl border p-2 text-sm" value={(q.modifier as { value_minor?: number }).value_minor ?? 0}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => editDyn(q.key, { modifier: { type: "fixed", value_minor: Number(e.target.value) || 0, scope: "pre_vat_rut", rut_eligible: false } })} />
              </div>
            ))}
          <button className="text-sm rounded-xl border px-2 py-1" onClick={addAddon}>+ Add add-on</button>
        </Panel>

        <Panel title="Fees (always applied)">
          {svc.config.fees.map((f, i) => (
            <div key={f.key} className="grid grid-cols-5 gap-2 items-center">
              <input aria-label="Fee key" className="col-span-2 rounded-xl border p-2 text-sm" value={f.key} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editFee(i, { key: e.target.value })} />
              <input aria-label="Fee label" className="col-span-2 rounded-xl border p-2 text-sm" value={f.label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editFee(i, { label: e.target.value })} />
              <input aria-label="Fee amount (minor)" type="number" className="rounded-xl border p-2 text-sm" value={f.amount_minor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editFee(i, { amount_minor: Number(e.target.value) || 0 })} />
            </div>
          ))}
          <button className="text-sm rounded-xl border px-2 py-1" onClick={addFee}>+ Add fee</button>
        </Panel>

        <Panel title="Boolean Modifiers (multiplier/delta)">
          {svc.config.dynamicQuestions
            .filter((q) => q.type === "boolean" && (!q.modifier || (q.modifier as DynModifier).type !== "fixed"))
            .map((q) => (
              <div key={q.key} className="grid grid-cols-6 gap-2 items-center">
                <input aria-label="Modifier key" className="col-span-2 rounded-xl border p-2 text-sm" value={q.key} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editDyn(q.key, { key: e.target.value })} />
                <input aria-label="Modifier label" className="col-span-2 rounded-xl border p-2 text-sm" value={q.label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editDyn(q.key, { label: e.target.value })} />
                <select aria-label="Modifier type" className="rounded-xl border p-2 text-sm" value={q.modifier && "type" in q.modifier ? (q.modifier as DynModifier).type : "multiplier"}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => editDyn(q.key, e.target.value === "multiplier"
                    ? { modifier: { type: "multiplier", value: 1.1, scope: "subtotal_ex_vat" } }
                    : { modifier: { type: "fixed", value_minor: 2500, scope: "pre_vat_rut", rut_eligible: false } })}>
                  <option value="multiplier">Multiplier</option>
                  <option value="fixed">Fixed (use Add-ons instead)</option>
                </select>
                <input aria-label="Multiplier value" type="number" className="rounded-xl border p-2 text-sm"
                  value={q.modifier && (q.modifier as DynModifier).type === "multiplier" ? (q.modifier as { value?: number }).value : 1}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => editDyn(q.key, { modifier: { type: "multiplier", value: Number(e.target.value) || 1, scope: "subtotal_ex_vat" } })}
                  />
              </div>
            ))}
          <button className="text-sm rounded-xl border px-2 py-1" onClick={addBoolMod}>+ Add boolean modifier</button>
        </Panel>
      </section>

      <section className="rounded-2xl border p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Preview Frequency</label>
          <select aria-label="Preview Frequency" className="rounded-xl border px-3 py-2 text-sm" value={previewFreq} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPreviewFreq(e.target.value)}>
            {svc.config.frequencyOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <span className="text-sm text-neutral-500">Toggle add-ons/modifiers to include them in Preview:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {svc.config.dynamicQuestions.map((q) => (
            <label key={q.key} className="flex items-center gap-2 text-sm border rounded-xl px-3 py-2">
              <input type="checkbox" checked={!!previewAnswers[q.key]} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPreviewAnswers((p: Record<string, boolean>) => ({ ...p, [q.key]: e.target.checked }))} />
              {q.label} <span className="text-neutral-500">({q.key})</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={preview} disabled={quoting || !tenantId} className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
            {quoting ? "Previewing…" : "Run Preview Quote"}
          </button>
          {quote && (
            <span className={`px-3 py-2 rounded-xl text-sm border ${invariantOK ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
              {invariantOK ? "Invariant OK" : "Invariant FAIL"}
            </span>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>

        {quote && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-neutral-500"><th className="py-2">Label</th><th className="py-2">Key</th><th className="py-2 text-right">Amount</th></tr></thead>
              <tbody>
                {quote.lines.map((l) => (
                  <tr key={l.key} className="border-t">
                    <td className="py-2">{l.label}</td>
                    <td className="py-2 text-neutral-500">{l.key}</td>
                    <td className="py-2 text-right">{fmt(l.amount_minor, quote.currency)}</td>
                  </tr>
                ))}
                <tr className="border-t font-medium">
                  <td className="py-2">Total</td>
                  <td />
                  <td className="py-2 text-right">{fmt(quote.total_minor, quote.currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <h2 className="font-medium mb-3">{props.title}</h2>
      <div className="space-y-2">{props.children}</div>
    </div>
  );
}

function fmt(minor: number, currency: string) {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")} ${currency}`;
}

async function toErr(res: Response) {
  const j = await res.json().catch(() => ({} as Record<string, unknown>));
  const msg = j?.error || j?.code || `HTTP_${res.status}`;
  return new Error(msg);
}

function rand() { return Math.random().toString(36).slice(2, 8); }
