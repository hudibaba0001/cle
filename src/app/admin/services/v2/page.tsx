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
  model: Model;
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
      return { ...base, fixed_tier: { tiers: s.fixedTiers } };
    case "tiered_multiplier":
      return { ...base, tiered_multiplier: { rateTiers: s.rateTiers } };
    case "universal_multiplier":
      return { ...base, universal_multiplier: { ratePerSqm: Number(s.ratePerSqm || 0) } };
    case "windows":
      return { ...base, windows: { types: s.windowTypes } };
    case "per_room":
      return { ...base, per_room: { rooms: s.roomTypes } };
    case "hourly_area":
      return { ...base, hourly_area: { hoursPerSqm: Number(s.hoursPerSqm || 0.1), ratePerHour: Number(s.ratePerHour || 0) } };
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
    name: "Universal Multiplier Demo",
    model: "universal_multiplier",
    vatRate: 25,
    rutEligible: true,
    minimum: 0,
    frequencyMultipliers: { one_time: 1, weekly: 1, biweekly: 1.15, monthly: 1.4 },
    fixedTiers: [], rateTiers: [], windowTypes: [], roomTypes: [],
    ratePerSqm: 25,
    hoursPerSqm: 0.1, ratePerHour: 300,
    fees: [], addons: [],
    modifiers: []
  });
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<Record<string, unknown> | null>(null);

  const inputs = useMemo(() => {
    // minimal form → inputs inference, adjust per model
    if (state.model === "windows") return { counts: Object.fromEntries(state.windowTypes.map((t, i) => [t.key || `window_${i}`, 1])) };
    if (state.model === "per_room") return { counts: Object.fromEntries(state.roomTypes.map((t, i) => [t.key || `room_${i}`, 1])) };
    return { area: 50 }; // default for area-based models
  }, [state]);

  // Array management helpers
  const addTier = (type: 'fixed' | 'tiered') => {
    const newTier = type === 'fixed' 
      ? { min: 0, max: 100, price: 500 }
      : { min: 0, max: 100, ratePerSqm: 25 };
    setState(s => ({
      ...s,
      [type === 'fixed' ? 'fixedTiers' : 'rateTiers']: [
        ...(type === 'fixed' ? s.fixedTiers : s.rateTiers),
        newTier
      ]
    }));
  };

  const removeTier = (index: number, type: 'fixed' | 'tiered') => {
    setState(s => ({
      ...s,
      [type === 'fixed' ? 'fixedTiers' : 'rateTiers']: 
        (type === 'fixed' ? s.fixedTiers : s.rateTiers).filter((_, i) => i !== index)
    }));
  };

  const updateTier = (index: number, field: string, value: number, type: 'fixed' | 'tiered') => {
    setState(s => ({
      ...s,
      [type === 'fixed' ? 'fixedTiers' : 'rateTiers']: 
        (type === 'fixed' ? s.fixedTiers : s.rateTiers).map((t, i) => 
          i === index ? { ...t, [field]: value } : t
        )
    }));
  };

  const addWindowType = () => {
    setState(s => ({
      ...s,
      windowTypes: [...s.windowTypes, { key: `window_${s.windowTypes.length}`, name: '', pricePerUnit: 0 }]
    }));
  };

  const removeWindowType = (index: number) => {
    setState(s => ({
      ...s,
      windowTypes: s.windowTypes.filter((_, i) => i !== index)
    }));
  };

  const updateWindowType = (index: number, field: string, value: string | number) => {
    setState(s => ({
      ...s,
      windowTypes: s.windowTypes.map((t, i) => 
        i === index ? { ...t, [field]: value } : t
      )
    }));
  };

  const addRoomType = () => {
    setState(s => ({
      ...s,
      roomTypes: [...s.roomTypes, { key: `room_${s.roomTypes.length}`, name: '', pricePerUnit: 0 }]
    }));
  };

  const removeRoomType = (index: number) => {
    setState(s => ({
      ...s,
      roomTypes: s.roomTypes.filter((_, i) => i !== index)
    }));
  };

  const updateRoomType = (index: number, field: string, value: string | number) => {
    setState(s => ({
      ...s,
      roomTypes: s.roomTypes.map((t, i) => 
        i === index ? { ...t, [field]: value } : t
      )
    }));
  };

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

  async function onSave() {
    try {
      setErr(null);
      const service = buildServiceConfig(state);
      
      const response = await fetch('/api/admin/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenant
        },
        body: JSON.stringify({
          name: service.name,
          config: service,
          active: true
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save service');
      }
      
      const result = await response.json();
      alert(`Service saved successfully! ID: ${result.id}`);
      
      // Reset form
      setState({
        name: "New Service",
        model: "universal_multiplier",
        vatRate: 25,
        rutEligible: true,
        minimum: 0,
        frequencyMultipliers: { one_time: 1, weekly: 1, biweekly: 1.15, monthly: 1.4 },
        fixedTiers: [], rateTiers: [], windowTypes: [], roomTypes: [],
        ratePerSqm: 25,
        hoursPerSqm: 0.1, ratePerHour: 300,
        fees: [], addons: [], modifiers: []
      });
      setPreview(null);
      
    } catch (e) {
      setErr(e as Record<string, unknown>);
    }
  }

  // Calculate invariant for preview
  const invariantCheck = useMemo(() => {
    if (!preview) return null;
    
    const total = Number(preview.total_minor || 0);
    const subtotal = Number(preview.subtotal_ex_vat_minor || preview.subtotal_minor || 0);
    const vat = Number(preview.vat_minor || 0);
    const rut = Number(preview.rut_minor || 0);
    const discount = Number(preview.discount_minor || 0);
    
    const sum = subtotal + vat + rut + discount;
    const matches = Math.abs(total - sum) < 1; // Allow 1 minor unit difference for rounding
    
    return {
      matches,
      total,
      sum,
      details: { subtotal, vat, rut, discount }
    };
  }, [preview]);

  // --- Enhanced Service Builder UI
  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Service Builder v2</h1>
        <p className="text-gray-600">Create and configure services with advanced pricing models</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Settings */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Basic Settings</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Service Name</label>
                <input type="text" className="border rounded px-3 py-2 w-full"
                  value={state.name} onChange={e=>setState(s=>({ ...s, name: e.target.value }))}
                  placeholder="Enter service name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pricing Model</label>
                <select className="border rounded px-3 py-2 w-full" title="Select pricing model"
                  value={state.model}
                  onChange={e=>setState(s=>({ ...s, model: e.target.value as Model }))}>
                  {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">VAT Rate (%)</label>
                <input type="number" className="border rounded px-3 py-2 w-full" placeholder="e.g. 25"
                  value={state.vatRate} onChange={e=>setState(s=>({ ...s, vatRate: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Minimum Price (SEK)</label>
                <input type="number" className="border rounded px-3 py-2 w-full" placeholder="e.g. 500"
                  value={state.minimum ?? 0} onChange={e=>setState(s=>({ ...s, minimum: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="mt-4">
              <label className="flex items-center">
                <input type="checkbox" className="mr-2"
                  checked={state.rutEligible}
                  onChange={e=>setState(s=>({ ...s, rutEligible: e.target.checked }))} />
                RUT Eligible (Swedish tax deduction)
              </label>
            </div>
          </div>

          {/* Model-Specific Configuration */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Pricing Configuration</h2>
            
            {state.model === "universal_multiplier" && (
              <div>
                <label className="block text-sm font-medium mb-1">Rate per m²</label>
                <input type="number" className="border rounded px-3 py-2 w-full" placeholder="e.g. 25"
                  value={state.ratePerSqm ?? 0} onChange={e=>setState(s=>({ ...s, ratePerSqm: Number(e.target.value) }))}/>
                <p className="text-sm text-gray-500 mt-1">Fixed rate per square meter</p>
              </div>
            )}

            {state.model === "hourly_area" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
          <div>
                    <label className="block text-sm font-medium mb-1">Hours per m²</label>
                    <input type="number" step="0.01" className="border rounded px-3 py-2 w-full" placeholder="e.g. 0.1"
                      value={state.hoursPerSqm ?? 0} onChange={e=>setState(s=>({ ...s, hoursPerSqm: Number(e.target.value) }))}/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rate per hour (SEK)</label>
                    <input type="number" className="border rounded px-3 py-2 w-full" placeholder="e.g. 300"
                      value={state.ratePerHour ?? 0} onChange={e=>setState(s=>({ ...s, ratePerHour: Number(e.target.value) }))}/>
                  </div>
                </div>
                <p className="text-sm text-gray-500">Calculate hours based on area, then multiply by hourly rate</p>
              </div>
            )}

            {state.model === "fixed_tier" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">Area Tiers (Fixed Prices)</label>
                  <button onClick={() => addTier('fixed')} className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
                    Add Tier
                  </button>
                </div>
                <div className="space-y-2">
                  {state.fixedTiers.map((tier, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 items-center">
                      <input type="number" placeholder="Min m²" className="border rounded px-2 py-1"
                        value={tier.min} onChange={e=>updateTier(i, 'min', Number(e.target.value), 'fixed')} />
                      <input type="number" placeholder="Max m²" className="border rounded px-2 py-1"
                        value={tier.max} onChange={e=>updateTier(i, 'max', Number(e.target.value), 'fixed')} />
                      <input type="number" placeholder="Price SEK" className="border rounded px-2 py-1"
                        value={tier.price} onChange={e=>updateTier(i, 'price', Number(e.target.value), 'fixed')} />
                      <button onClick={() => removeTier(i, 'fixed')} className="px-2 py-1 bg-red-500 text-white rounded text-sm">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">Fixed price per area range</p>
              </div>
            )}

            {state.model === "tiered_multiplier" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">Area Tiers (Rate per m²)</label>
                  <button onClick={() => addTier('tiered')} className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
                    Add Tier
                  </button>
                </div>
                <div className="space-y-2">
                  {state.rateTiers.map((tier, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 items-center">
                      <input type="number" placeholder="Min m²" className="border rounded px-2 py-1"
                        value={tier.min} onChange={e=>updateTier(i, 'min', Number(e.target.value), 'tiered')} />
                      <input type="number" placeholder="Max m²" className="border rounded px-2 py-1"
                        value={tier.max} onChange={e=>updateTier(i, 'max', Number(e.target.value), 'tiered')} />
                      <input type="number" placeholder="Rate/m²" className="border rounded px-2 py-1"
                        value={tier.ratePerSqm} onChange={e=>updateTier(i, 'ratePerSqm', Number(e.target.value), 'tiered')} />
                      <button onClick={() => removeTier(i, 'tiered')} className="px-2 py-1 bg-red-500 text-white rounded text-sm">
                        Remove
                      </button>
                </div>
              ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">Different rates per area range</p>
              </div>
            )}

            {state.model === "windows" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">Window Types</label>
                  <button onClick={addWindowType} className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
                    Add Type
                  </button>
                </div>
                <div className="space-y-2">
                  {state.windowTypes.map((type, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 items-center">
                      <input type="text" placeholder="Window type" className="border rounded px-2 py-1"
                        value={type.name} onChange={e=>updateWindowType(i, 'name', e.target.value)} />
                      <input type="text" placeholder="Key" className="border rounded px-2 py-1"
                        value={type.key} onChange={e=>updateWindowType(i, 'key', e.target.value)} />
                      <input type="number" placeholder="Price" className="border rounded px-2 py-1"
                        value={type.pricePerUnit} onChange={e=>updateWindowType(i, 'pricePerUnit', Number(e.target.value))} />
                      <button onClick={() => removeWindowType(i)} className="px-2 py-1 bg-red-500 text-white rounded text-sm">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">Different window types with individual pricing</p>
              </div>
            )}

            {state.model === "per_room" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">Room Types</label>
                  <button onClick={addRoomType} className="px-3 py-1 bg-blue-500 text-white rounded text-sm">
                    Add Type
                  </button>
                </div>
                <div className="space-y-2">
                  {state.roomTypes.map((type, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 items-center">
                      <input type="text" placeholder="Room type" className="border rounded px-2 py-1"
                        value={type.name} onChange={e=>updateRoomType(i, 'name', e.target.value)} />
                      <input type="text" placeholder="Key" className="border rounded px-2 py-1"
                        value={type.key} onChange={e=>updateRoomType(i, 'key', e.target.value)} />
                      <input type="number" placeholder="Price" className="border rounded px-2 py-1"
                        value={type.pricePerUnit} onChange={e=>updateRoomType(i, 'pricePerUnit', Number(e.target.value))} />
                      <button onClick={() => removeRoomType(i)} className="px-2 py-1 bg-red-500 text-white rounded text-sm">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">Different room types with individual pricing</p>
            </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex gap-3">
              <button onClick={onPreview} className="px-6 py-2 bg-blue-600 text-white rounded font-medium">
                Preview Quote
              </button>
              <button onClick={onSave} 
                disabled={!preview || !invariantCheck?.matches}
                className="px-6 py-2 bg-green-600 text-white rounded font-medium disabled:bg-gray-400 disabled:cursor-not-allowed">
                Save Service
              </button>
            </div>
            {err && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              Error: {JSON.stringify(err)}
            </div>}
          </div>
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white border rounded-lg p-4 sticky top-4">
            <h2 className="text-lg font-semibold mb-4">Preview & Validation</h2>
            
            {preview ? (
              <div className="space-y-4">
                {/* Invariant Check */}
                <div className={`p-3 rounded ${invariantCheck?.matches ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="font-medium">
                    Invariant: {invariantCheck?.matches ? '✅ PASS' : '❌ FAIL'}
                  </div>
                  <div className="text-sm mt-1">
                    Total: {invariantCheck?.total} minor<br/>
                    Sum: {invariantCheck?.sum} minor
                  </div>
                </div>

                {/* Quote Summary */}
                <div>
                  <h3 className="font-medium mb-2">Quote Breakdown</h3>
                  <div className="text-sm space-y-1">
                    <div>Currency: {String(preview.currency || 'SEK')}</div>
                    <div>Total: {Number(preview.total_minor || 0) / 100} SEK</div>
                    <div>Subtotal: {Number(preview.subtotal_minor || 0) / 100} SEK</div>
                    <div>VAT: {Number(preview.vat_minor || 0) / 100} SEK</div>
                    {Number(preview.rut_minor || 0) !== 0 && (
                      <div>RUT: {Number(preview.rut_minor || 0) / 100} SEK</div>
                    )}
                  </div>
                </div>

                {/* Full JSON (collapsed) */}
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">Full Response</summary>
                  <pre className="mt-2 p-2 bg-gray-50 rounded overflow-auto max-h-64">
                    {JSON.stringify(preview, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">
                Click &quot;Preview Quote&quot; to test pricing
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
