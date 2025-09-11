"use client";

import { useState } from "react";
import { ServiceConfig } from "@/lib/pricing-v2/types";

// Minimal v2 Service Builder with Dynamic Pricing preview
export default function AdminServicesV2Page() {
  const [tenant, setTenant] = useState("8f98ad87-3f30-432d-9b00-f2a7c1c76c63");
  type ModifierRule = {
    key: string;
    label: string;
    condition: { type: "boolean"; when: boolean; answerKey: string };
    effect: {
      target: "base_after_frequency" | "subtotal_before_modifiers";
      mode: "percent" | "fixed";
      value: number;
      direction: "increase" | "decrease";
      rutEligible: boolean;
      label?: string;
    };
  };

  type ServiceForm = {
    model: "per_sqm" | "fixed" | "hourly" | "per_room" | "windows";
    name?: string;
    minPrice?: number;
    vatRate: number;
    frequencyMultipliers?: Record<string, number>;
    addons: Array<{ key: string; name: string; type?: "fixed" | "per_unit"; amount: number }>;
    pricePerSqm?: number;
    modifiers: ModifierRule[];
    previewAnswers: Record<string, unknown>;
    inputs: { area?: number; hours?: number; rooms?: Record<string, number>; windows?: Record<string, number> };
    frequency: "one_time" | "monthly" | "biweekly" | "weekly";
  };

  const [form, setForm] = useState<ServiceForm>({
    model: "per_sqm",
    name: "Per Sqm Cleaning",
    vatRate: 25,
    minPrice: 0,
    frequencyMultipliers: { one_time: 1.0, monthly: 1.4, biweekly: 1.15, weekly: 1.0 },
    addons: [],
    pricePerSqm: 25,
    modifiers: [
      {
        key: "has_dog",
        label: "Do you have a dog?",
        condition: { type: "boolean", when: true, answerKey: "has_dog" },
        effect: { target: "subtotal_before_modifiers", mode: "percent", value: 10, direction: "increase", rutEligible: false, label: "+10% pet handling" }
      }
    ],
    previewAnswers: { has_dog: false },
    inputs: { area: 50 },
    frequency: "monthly"
  });

  type Preview = {
    currency: string;
    model: string;
    lines: Array<{ key: string; label: string; amount_minor: number }>;
    subtotal_ex_vat_minor: number;
    vat_minor: number;
    rut_minor: number;
    discount_minor: number;
    total_minor: number;
  } | null;
  const [preview, setPreview] = useState<Preview>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function previewQuote() {
    setLoading(true); setError(null);
    try {
      const base = {
        model: form.model,
        name: form.name,
        minPrice: form.minPrice,
        vatRate: form.vatRate,
        addons: form.addons.map(a => ({ key: a.key, name: a.name, type: a.type ?? "fixed", amount: a.amount })),
        frequencyMultipliers: form.frequencyMultipliers,
        // modifiers live on base schema
        modifiers: form.modifiers,
      } as Partial<ServiceConfig> & { modifiers: ModifierRule[] };

      const service = ({
        ...base,
        ...(form.model === "per_sqm" ? { pricePerSqm: form.pricePerSqm } : {}),
      }) as ServiceConfig;

      const res = await fetch("/api/pricing/v2/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenant },
        body: JSON.stringify({
          tenant: { currency: "SEK", vat_rate: 25, rut_enabled: false },
          service,
          frequency: form.frequency,
          inputs: form.inputs,
          addons: [],
          applyRUT: false,
          coupon: undefined,
          answers: form.previewAnswers,
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || "Failed to preview");
      setPreview(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Builder v2</h1>
          <p className="text-gray-600">Dynamic pricing rules and live preview</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Tenant</span>
          <input className="border rounded px-2 py-1 text-sm" value={tenant} onChange={e=>setTenant(e.target.value)} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          <h2 className="font-semibold">Service</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Model
              <select className="w-full border rounded px-2 py-1" value={form.model} onChange={e=>setForm(f=>({ ...f, model: e.target.value as ServiceForm["model"] }))}>
                <option value="per_sqm">per_sqm</option>
                <option value="fixed">fixed</option>
                <option value="hourly">hourly</option>
                <option value="per_room">per_room</option>
                <option value="windows">windows</option>
              </select>
            </label>
            <label className="text-sm">VAT %
              <input className="w-full border rounded px-2 py-1" type="number" value={form.vatRate} onChange={e=>setForm(f=>({ ...f, vatRate: Number(e.target.value||0) }))} />
            </label>
            <label className="text-sm">Min price
              <input className="w-full border rounded px-2 py-1" type="number" value={form.minPrice} onChange={e=>setForm(f=>({ ...f, minPrice: Number(e.target.value||0) }))} />
            </label>
            {form.model === "per_sqm" && (
              <label className="text-sm">Price / sqm
                <input className="w-full border rounded px-2 py-1" type="number" value={form.pricePerSqm} onChange={e=>setForm(f=>({ ...f, pricePerSqm: Number(e.target.value||0) }))} />
              </label>
            )}
          </div>

          <div>
            <h3 className="font-semibold mt-4">Dynamic Pricing (Yes/No rules)</h3>
            <div className="space-y-3 mt-2">
              {form.modifiers.map((m,i)=> (
                <div key={m.key} className="border border-dashed rounded p-3 space-y-2">
                  <div className="font-medium">Rule {i+1}</div>
                  <label className="block text-sm">Key
                    <input className="w-full border rounded px-2 py-1" value={m.key} onChange={e=>{
                      const v=e.target.value; setForm(prev=>{ const next=[...prev.modifiers]; next[i]={...m, key:v}; return { ...prev, modifiers: next }; });
                    }}/>
                  </label>
                  <label className="block text-sm">Label
                    <input className="w-full border rounded px-2 py-1" value={m.label} onChange={e=>{
                      const v=e.target.value; setForm(prev=>{ const next=[...prev.modifiers]; next[i]={...m, label:v}; return { ...prev, modifiers: next }; });
                    }}/>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-sm">Answer key
                      <input className="w-full border rounded px-2 py-1" value={m.condition.answerKey} onChange={e=>{
                        const v=e.target.value; setForm(prev=>{ const next=[...prev.modifiers]; next[i]={...m, condition:{...m.condition, answerKey:v}}; return { ...prev, modifiers: next }; });
                      }}/>
                    </label>
                    <label className="text-sm">When
                      <select className="w-full border rounded px-2 py-1" value={m.condition.when?"true":"false"} onChange={e=>{
                        const v=e.target.value==="true"; setForm(prev=>{ const next=[...prev.modifiers]; next[i]={...m, condition:{...m.condition, when:v}}; return { ...prev, modifiers: next }; });
                      }}>
                        <option value="true">answer is Yes</option>
                        <option value="false">answer is No</option>
                      </select>
                    </label>
                    <label className="text-sm">Target
                      <select className="w-full border rounded px-2 py-1" value={m.effect.target} onChange={e=>{
                        const v=e.target.value as ModifierRule["effect"]["target"]; setForm(prev=>{ const next=[...prev.modifiers]; next[i]={...m, effect:{...m.effect, target:v}}; return { ...prev, modifiers: next }; });
                      }}>
                        <option value="subtotal_before_modifiers">Subtotal (default)</option>
                        <option value="base_after_frequency">Base after frequency</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <label className="text-sm">Mode
                      <select className="w-full border rounded px-2 py-1" value={m.effect.mode} onChange={e=>{
                        const v=e.target.value as ModifierRule["effect"]["mode"]; setForm(prev=>{ const next=[...prev.modifiers]; next[i]={...m, effect:{...m.effect, mode:v}}; return { ...prev, modifiers: next }; });
                      }}>
                        <option value="percent">percent</option>
                        <option value="fixed">fixed (SEK)</option>
                      </select>
                    </label>
                    <label className="text-sm">Value
                      <input className="w-full border rounded px-2 py-1" type="number" value={m.effect.value} onChange={e=>{
                        const v=Number(e.target.value||0); setForm(prev=>{ const next=[...prev.modifiers]; next[i]={...m, effect:{...m.effect, value:v}}; return { ...prev, modifiers: next }; });
                      }}/>
                    </label>
                    <label className="text-sm">Direction
                      <select className="w-full border rounded px-2 py-1" value={m.effect.direction} onChange={e=>{
                        const v=e.target.value as ModifierRule["effect"]["direction"]; setForm(prev=>{ const next=[...prev.modifiers]; next[i]={...m, effect:{...m.effect, direction:v}}; return { ...prev, modifiers: next }; });
                      }}>
                        <option value="increase">increase</option>
                        <option value="decrease">decrease</option>
                      </select>
                    </label>
                    <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={m.effect.rutEligible} onChange={e=>{
                      const v=e.target.checked; setForm(prev=>{ const next=[...prev.modifiers]; next[i]={...m, effect:{...m.effect, rutEligible:v}}; return { ...prev, modifiers: next }; });
                    }}/> RUT eligible</label>
                  </div>
                  <button className="text-red-600 text-sm" onClick={()=>{
                    setForm(prev=>{ const next=[...prev.modifiers]; next.splice(i,1); return { ...prev, modifiers: next }; });
                  }}>Remove rule</button>
                </div>
              ))}
              <button className="text-blue-600 text-sm" onClick={()=> setForm(prev=>({ ...prev, modifiers: [...prev.modifiers, {
                key: `rule_${Date.now()}`,
                label: "New boolean rule",
                condition: { type: "boolean", when: true, answerKey: "custom_flag" },
                effect: { target: "subtotal_before_modifiers", mode: "percent", value: 10, direction: "increase", rutEligible: false }
              }] })) }>+ Add rule</button>

              <div className="grid grid-cols-2 gap-3 mt-2">
        {form.modifiers.map(m => (
                  <label key={`ans_${m.key}`} className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(form.previewAnswers[m.condition.answerKey])} onChange={e=> setForm(prev=> ({ ...prev, previewAnswers: { ...prev.previewAnswers, [m.condition.answerKey]: e.target.checked } }))} />
          Customer answers &quot;Yes&quot; to: {m.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={previewQuote} disabled={loading}>{loading?"Generating...":"Preview quote"}</button>
            {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold">Preview</h2>
          <pre className="text-xs bg-gray-50 rounded p-3 overflow-auto max-h-[600px]">{preview ? JSON.stringify(preview, null, 2) : "Run preview to see breakdown JSON"}</pre>
        </div>
      </div>
    </div>
  );
}
