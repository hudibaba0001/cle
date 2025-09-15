"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import React from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

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
  // Model-specific optional configs
  fixed_tier?: { tiers: { min: number; max: number; price_minor: number }[] };
  tiered_multiplier?: { rateTiers: { min: number; max: number; ratePerSqm: number }[] };
  universal_multiplier?: { ratePerSqm: number };
  windows?: { types: { key: string; name: string; pricePerUnit: number }[] };
  per_room?: { roomTypes: { key: string; name: string; pricePerRoom: number }[] };
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

export default function ServiceBuilderPage() {
  return (
    <Suspense fallback={<BuilderSkeleton />}> 
      <ServiceBuilderV2 />
    </Suspense>
  );
}

function BuilderSkeleton() {
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-4">
      <div className="h-8 w-64 rounded-xl bg-neutral-100" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-56 rounded-2xl border bg-neutral-50" />
        <div className="h-56 rounded-2xl border bg-neutral-50" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="h-64 rounded-2xl border bg-neutral-50" />
        <div className="h-64 rounded-2xl border bg-neutral-50" />
        <div className="h-64 rounded-2xl border bg-neutral-50" />
      </div>
    </div>
  );
}

function ServiceBuilderV2() {
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
  const [previewArea, setPreviewArea] = useState<number>(50);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      if (!serviceId || !tenantId) return;
      try {
        const res = await fetch(`/api/admin/services/${serviceId}`, { headers: { "x-tenant-id": tenantId }, cache: "no-store" });
        if (!res.ok) return;
        const row = await res.json() as { id: string; name: string; model: PricingModel; active: boolean; config: unknown };
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
    const c = (cfg ?? {}) as Record<string, unknown>;
    const model = (c.model as string | undefined) as PricingModel | undefined;

    const base: ServiceConfig = {
      currency: "SEK",
      rutEligible: (c.rutEligible as boolean | undefined) ?? true,
      hourlyRate: typeof c.hourlyRate === "number" ? c.hourlyRate : 1100,
      areaToHours: { "50": 3 },
      frequencyOptions: Array.isArray(c.frequencyOptions) ? (c.frequencyOptions as FrequencyOption[]) : [],
      dynamicQuestions: Array.isArray(c.dynamicQuestions) ? (c.dynamicQuestions as DynamicQuestion[]) : [],
      fees: Array.isArray(c.fees)
        ? ((c.fees as unknown[]).map((f) => {
            const fr = f as Record<string, unknown>;
            return {
              key: String(fr.key ?? "fee_" + rand()),
              label: String(fr.name ?? fr.label ?? "Fee"),
              amount_minor: Math.round(Number(fr.amount ?? 0) * 100),
              rut_eligible: Boolean(fr.rutEligible ?? fr.rut_eligible ?? false),
              apply: "always",
            } as Fee;
          }))
        : [],
    };

    // Map model-specific blocks back to builder shape
    if (model === "fixed_tier") {
      const tiers = Array.isArray(c.tiers)
        ? (c.tiers as Array<Record<string, unknown>>).map((t) => ({
            min: Number(t.min ?? 0),
            max: Number(t.max ?? 0),
            price_minor: Math.round(Number(t.price ?? 0) * 100),
          }))
        : [];
      base.fixed_tier = { tiers };
    }
    if (model === "tiered_multiplier") {
      const tiers = Array.isArray(c.tiers)
        ? (c.tiers as Array<Record<string, unknown>>).map((t) => ({
            min: Number(t.min ?? 0),
            max: Number(t.max ?? 0),
            ratePerSqm: Number(t.ratePerSqm ?? 0),
          }))
        : [];
      base.tiered_multiplier = { rateTiers: tiers };
    }
    if (model === "universal_multiplier") {
      base.universal_multiplier = { ratePerSqm: Number(c.ratePerSqm ?? 0) };
    }
    if (model === "windows") {
      const types = Array.isArray(c.windowTypes)
        ? (c.windowTypes as Array<Record<string, unknown>>).map((t) => ({
            key: String(t.key ?? "type_" + rand()),
            name: String(t.name ?? "Type"),
            pricePerUnit: Number(t.pricePerUnit ?? 0),
          }))
        : [];
      base.windows = { types };
    }
    if (model === "per_room") {
      const roomTypes = Array.isArray(c.roomTypes)
        ? (c.roomTypes as Array<Record<string, unknown>>).map((t) => ({
            key: String(t.key ?? "room_" + rand()),
            name: String(t.name ?? "Room"),
            pricePerRoom: Number(t.pricePerRoom ?? 0),
          }))
        : [];
      base.per_room = { roomTypes };
    }
    if (model === "hourly_area") {
      // Convert array to compact map using 'max' as key
      const arr = Array.isArray(c.areaToHours)
        ? (c.areaToHours as Array<Record<string, unknown>>)
        : [];
      const map: Record<string, number> = {};
      for (const it of arr) {
        const max = Number(it.max ?? 0);
        const hours = Number(it.hours ?? 0);
        if (max > 0) map[String(max)] = hours;
      }
      base.hourlyRate = Number(c.hourlyRate ?? base.hourlyRate ?? 1100);
      base.areaToHours = Object.keys(map).length ? map : { "50": 3 };
    }
    return base;
  }

  function up(patch: Partial<ServiceRow>) {
    setSvc((prev: ServiceRow) => {
      const next = { ...prev, ...patch, config: { ...prev.config, ...(patch.config ?? {}) } };
      if (JSON.stringify(next) !== JSON.stringify(prev)) setDirty(true);
      return next;
    });
  }

  function buildPersistConfig(): Record<string, unknown> {
    const model = svc.model === "hourly" ? "hourly_area" : svc.model;
    const base: Record<string, unknown> = {
      model,
      name: svc.name,
      rutEligible: !!svc.config.rutEligible,
      fees: (svc.config.fees ?? []).map((f) => ({
        key: f.key,
        name: f.label,
        amount: (f.amount_minor ?? 0) / 100,
        rutEligible: !!f.rut_eligible,
      })),
      // Keep modifiers empty; dynamicQuestions are compiled at quote time
      modifiers: [],
      frequencyMultipliers: { one_time: 1.0, weekly: 1.0, biweekly: 1.15, monthly: 1.4 },
      // v2.1 extensions
      frequencyOptions: svc.config.frequencyOptions ?? [],
      dynamicQuestions: svc.config.dynamicQuestions ?? [],
    };

    if (model === "fixed_tier") {
      base.tiers = (svc.config.fixed_tier?.tiers ?? []).map((t) => ({
        min: Number(t.min || 0),
        max: Number(t.max || 0),
        price: (Number(t.price_minor || 0)) / 100,
      }));
    }
    if (model === "tiered_multiplier") {
      base.tiers = (svc.config.tiered_multiplier?.rateTiers ?? []).map((t) => ({
        min: Number(t.min || 0),
        max: Number(t.max || 0),
        ratePerSqm: Number(t.ratePerSqm || 0),
      }));
      base.minimum = 0;
    }
    if (model === "universal_multiplier") {
      base.ratePerSqm = Number(svc.config.universal_multiplier?.ratePerSqm || 0);
      base.minimum = 0;
    }
    if (model === "windows") {
      base.windowTypes = (svc.config.windows?.types ?? []).map((t) => ({
        key: t.key,
        name: t.name,
        pricePerUnit: Number(t.pricePerUnit || 0),
      }));
      base.minimum = 0;
    }
    if (model === "per_room") {
      base.roomTypes = (svc.config.per_room?.roomTypes ?? []).map((t) => ({
        key: t.key,
        name: t.name,
        pricePerRoom: Number(t.pricePerRoom || 0),
      }));
      base.minimum = 0;
    }
    if (model === "hourly_area") {
      base.hourlyRate = Number(svc.config.hourlyRate || 0);
      const map = svc.config.areaToHours ?? { "50": 3 };
      const entries = Object.entries(map)
        .map(([k, hours]) => ({ max: Number(k), hours: Number(hours), min: 0 }))
        .filter((x) => x.max > 0 && x.hours > 0)
        .sort((a, b) => a.max - b.max);
      // fill min from previous max
      let prevMax = 0;
      for (const it of entries) { it.min = prevMax; prevMax = it.max; }
      base.areaToHours = entries.map((e) => ({ min: e.min, max: e.max, hours: e.hours }));
      base.minimum = 0;
    }
    return base;
  }

  async function save(): Promise<string | null> {
    setError(null);
    if (!tenantId) { setError("TENANT_ID_REQUIRED"); return null; }
    setSaving(true);
    try {
      const configToSave = buildPersistConfig();
      const body = JSON.stringify({ name: svc.name, active: svc.active, config: configToSave });
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
        tenant: { currency: svc.config.currency || "SEK", vat_rate: 25, rut_enabled: !!svc.config.rutEligible },
        service_id: svc.id,
        frequency: previewFreq,
        inputs: { area: previewArea },
        addons: [] as Array<{ key: string; quantity?: number }>,
        applyRUT: !!svc.config.rutEligible,
        coupon: undefined as unknown,
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

  // --- Model helpers ---
  function handleModelChange(m: PricingModel) {
    const cfg: ServiceConfig = { ...svc.config };
    if (m === "fixed_tier" && !cfg.fixed_tier) cfg.fixed_tier = { tiers: [] };
    if (m === "tiered_multiplier" && !cfg.tiered_multiplier) cfg.tiered_multiplier = { rateTiers: [] };
    if (m === "universal_multiplier" && !cfg.universal_multiplier) cfg.universal_multiplier = { ratePerSqm: 0 };
    if (m === "windows" && !cfg.windows) cfg.windows = { types: [] };
    if (m === "per_room" && !cfg.per_room) cfg.per_room = { roomTypes: [] };
    up({ model: m, config: cfg });
  }

  // fixed_tier
  function addFixedTier() {
    const tiers = svc.config.fixed_tier?.tiers ?? [];
    up({ config: { ...svc.config, fixed_tier: { tiers: [...tiers, { min: 1, max: 50, price_minor: 3000 }] } } });
  }
  function editFixedTier(index: number, patch: Partial<{ min: number; max: number; price_minor: number }>) {
    const tiers = (svc.config.fixed_tier?.tiers ?? []).map((t, i) => (i === index ? { ...t, ...patch } : t));
    up({ config: { ...svc.config, fixed_tier: { tiers } } });
  }
  function removeFixedTier(index: number) {
    const tiers = (svc.config.fixed_tier?.tiers ?? []).filter((_, i) => i !== index);
    up({ config: { ...svc.config, fixed_tier: { tiers } } });
  }

  // tiered_multiplier
  function addRateTier() {
    const rateTiers = svc.config.tiered_multiplier?.rateTiers ?? [];
    up({ config: { ...svc.config, tiered_multiplier: { rateTiers: [...rateTiers, { min: 1, max: 50, ratePerSqm: 50 }] } } });
  }
  function editRateTier(index: number, patch: Partial<{ min: number; max: number; ratePerSqm: number }>) {
    const rateTiers = (svc.config.tiered_multiplier?.rateTiers ?? []).map((t, i) => (i === index ? { ...t, ...patch } : t));
    up({ config: { ...svc.config, tiered_multiplier: { rateTiers } } });
  }
  function removeRateTier(index: number) {
    const rateTiers = (svc.config.tiered_multiplier?.rateTiers ?? []).filter((_, i) => i !== index);
    up({ config: { ...svc.config, tiered_multiplier: { rateTiers } } });
  }

  // universal_multiplier
  function setUniversalRate(val: number) {
    up({ config: { ...svc.config, universal_multiplier: { ratePerSqm: val } } });
  }

  // windows
  function addWindowType() {
    const types = svc.config.windows?.types ?? [];
    up({ config: { ...svc.config, windows: { types: [...types, { key: `type_${rand()}`, name: "4 panes", pricePerUnit: 99 }] } } });
  }
  function editWindowType(index: number, patch: Partial<{ key: string; name: string; pricePerUnit: number }>) {
    const types = (svc.config.windows?.types ?? []).map((t, i) => (i === index ? { ...t, ...patch } : t));
    up({ config: { ...svc.config, windows: { types } } });
  }
  function removeWindowType(index: number) {
    const types = (svc.config.windows?.types ?? []).filter((_, i) => i !== index);
    up({ config: { ...svc.config, windows: { types } } });
  }

  // per_room
  function addRoomType() {
    const roomTypes = svc.config.per_room?.roomTypes ?? [];
    up({ config: { ...svc.config, per_room: { roomTypes: [...roomTypes, { key: `room_${rand()}`, name: "Bedroom", pricePerRoom: 2500 }] } } });
  }
  function editRoomType(index: number, patch: Partial<{ key: string; name: string; pricePerRoom: number }>) {
    const roomTypes = (svc.config.per_room?.roomTypes ?? []).map((t, i) => (i === index ? { ...t, ...patch } : t));
    up({ config: { ...svc.config, per_room: { roomTypes } } });
  }
  function removeRoomType(index: number) {
    const roomTypes = (svc.config.per_room?.roomTypes ?? []).filter((_, i) => i !== index);
    up({ config: { ...svc.config, per_room: { roomTypes } } });
  }

  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
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
          <select aria-label="Pricing model" className="w-full rounded-xl border p-2 text-sm" value={svc.model} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleModelChange(e.target.value as PricingModel)}>
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

          {svc.model === "fixed_tier" && (
            <div className="space-y-2">
              <label className="text-sm">Fixed tiers</label>
              {(svc.config.fixed_tier?.tiers ?? []).map((t, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-center">
                  <input aria-label="Tier min" type="number" className="rounded-xl border p-2 text-sm" value={t.min}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => editFixedTier(i, { min: Number(e.target.value) || 0 })} />
                  <input aria-label="Tier max" type="number" className="rounded-xl border p-2 text-sm" value={t.max}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => editFixedTier(i, { max: Number(e.target.value) || 0 })} />
                  <input aria-label="Tier price (minor)" type="number" className="rounded-xl border p-2 text-sm" value={t.price_minor}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => editFixedTier(i, { price_minor: Number(e.target.value) || 0 })} />
                  <button className="text-sm rounded-xl border px-2 py-1" onClick={() => removeFixedTier(i)}>Remove</button>
                </div>
              ))}
              <button className="text-sm rounded-xl border px-2 py-1" onClick={addFixedTier}>+ Add tier</button>
            </div>
          )}

          {svc.model === "tiered_multiplier" && (
            <div className="space-y-2">
              <label className="text-sm">Rate tiers (per sqm)</label>
              {(svc.config.tiered_multiplier?.rateTiers ?? []).map((t, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-center">
                  <input aria-label="Min sqm" type="number" className="rounded-xl border p-2 text-sm" value={t.min}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => editRateTier(i, { min: Number(e.target.value) || 0 })} />
                  <input aria-label="Max sqm" type="number" className="rounded-xl border p-2 text-sm" value={t.max}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => editRateTier(i, { max: Number(e.target.value) || 0 })} />
                  <input aria-label="Rate per sqm" type="number" className="rounded-xl border p-2 text-sm" value={t.ratePerSqm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => editRateTier(i, { ratePerSqm: Number(e.target.value) || 0 })} />
                  <button className="text-sm rounded-xl border px-2 py-1" onClick={() => removeRateTier(i)}>Remove</button>
                </div>
              ))}
              <button className="text-sm rounded-xl border px-2 py-1" onClick={addRateTier}>+ Add rate tier</button>
            </div>
          )}

          {svc.model === "universal_multiplier" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm">Rate per sqm</label>
                <input aria-label="Rate per sqm" type="number" className="w-full rounded-xl border p-2 text-sm" value={svc.config.universal_multiplier?.ratePerSqm ?? 0}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUniversalRate(Number(e.target.value) || 0)} />
              </div>
            </div>
          )}

          {svc.model === "windows" && (
            <div className="space-y-2">
              <label className="text-sm">Window types</label>
              {(svc.config.windows?.types ?? []).map((t, i) => (
                <div key={t.key} className="grid grid-cols-4 gap-2 items-center">
                  <input aria-label="Type key" className="rounded-xl border p-2 text-sm" value={t.key} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editWindowType(i, { key: e.target.value })} />
                  <input aria-label="Type name" className="rounded-xl border p-2 text-sm" value={t.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editWindowType(i, { name: e.target.value })} />
                  <input aria-label="Price per unit" type="number" className="rounded-xl border p-2 text-sm" value={t.pricePerUnit} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editWindowType(i, { pricePerUnit: Number(e.target.value) || 0 })} />
                  <button className="text-sm rounded-xl border px-2 py-1" onClick={() => removeWindowType(i)}>Remove</button>
                </div>
              ))}
              <button className="text-sm rounded-xl border px-2 py-1" onClick={addWindowType}>+ Add window type</button>
            </div>
          )}

          {svc.model === "per_room" && (
            <div className="space-y-2">
              <label className="text-sm">Room types</label>
              {(svc.config.per_room?.roomTypes ?? []).map((t, i) => (
                <div key={t.key} className="grid grid-cols-4 gap-2 items-center">
                  <input aria-label="Room key" className="rounded-xl border p-2 text-sm" value={t.key} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editRoomType(i, { key: e.target.value })} />
                  <input aria-label="Room name" className="rounded-xl border p-2 text-sm" value={t.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editRoomType(i, { name: e.target.value })} />
                  <input aria-label="Price per room" type="number" className="rounded-xl border p-2 text-sm" value={t.pricePerRoom} onChange={(e: React.ChangeEvent<HTMLInputElement>) => editRoomType(i, { pricePerRoom: Number(e.target.value) || 0 })} />
                  <button className="text-sm rounded-xl border px-2 py-1" onClick={() => removeRoomType(i)}>Remove</button>
                </div>
              ))}
              <button className="text-sm rounded-xl border px-2 py-1" onClick={addRoomType}>+ Add room type</button>
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
          <label className="text-sm ml-3">Area</label>
          <input aria-label="Preview Area" type="number" className="w-24 rounded-xl border px-3 py-2 text-sm" value={previewArea}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPreviewArea(Number(e.target.value) || 0)} />
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
    </Suspense>
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
