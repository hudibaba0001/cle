"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ServiceConfig, QuoteBreakdown, FrequencyKey } from "@/lib/pricing-v2/types";

type PublicService = {
  id: string;
  name: string;
  model: string;
  config: ServiceConfig;
  vatRate: number;
  rutEligible: boolean;
};

export default function WidgetPage() {
  const [tenant, setTenant] = useState("8f98ad87-3f30-432d-9b00-f2a7c1c76c63");
  const [services, setServices] = useState<PublicService[]>([]);
  const [selId, setSelId] = useState<string>("");
  const [frequency, setFrequency] = useState<FrequencyKey>("monthly");
  const [inputs, setInputs] = useState<Record<string, unknown>>({ area: 50 });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setNote(null);
      try {
        const r = await fetch("/api/public/services", { headers: { "x-tenant-id": tenant }, cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || r.statusText);
        setServices(j.items ?? []);
        if (!selId && (j.items?.length ?? 0) > 0) setSelId(j.items[0].id);
      } catch (e) {
        setNote(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [tenant, selId]);

  const sel = useMemo(() => services.find(s => s.id === selId) || null, [services, selId]);
  const expects = useMemo(() => {
    type SimpleType = { key: string; name: string };
    type SimpleBoolMod = { key: string; label: string; condition: { type: "boolean"; when: boolean; answerKey: string } };
    if (!sel) return { needsArea:false, windowTypes:[] as SimpleType[], roomTypes:[] as SimpleType[], booleanMods:[] as SimpleBoolMod[] };
    const cfg = sel.config as ServiceConfig;
    // derive simple shapes for UI
    const windowTypes: SimpleType[] = cfg.model === "windows" ? cfg.windowTypes.map(w=>({ key:w.key, name:w.name })) : [];
    const roomTypes: SimpleType[] = cfg.model === "per_room" ? cfg.roomTypes.map(r=>({ key:r.key, name:r.name })) : [];
    const isBoolMod = (m: unknown): m is SimpleBoolMod => {
      if (typeof m !== "object" || m === null) return false;
      const mm = m as Record<string, unknown>;
      const cond = mm["condition"] as Record<string, unknown> | undefined;
      return typeof mm["key"] === "string" && typeof mm["label"] === "string" &&
        cond !== undefined && cond["type"] === "boolean" && typeof cond["answerKey"] === "string" && typeof cond["when"] === "boolean";
    };
    const booleanMods: SimpleBoolMod[] = (cfg.modifiers ?? []).filter(isBoolMod);
    return {
      needsArea: ["fixed_tier","tiered_multiplier","universal_multiplier","hourly_area"].includes(sel.model),
      windowTypes,
      roomTypes,
      booleanMods,
    };
  }, [sel]);

  async function runQuote() {
    if (!sel) return;
  setQuote(null); setNote(null);
    try {
      const r = await fetch("/api/public/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenant },
        body: JSON.stringify({
          tenant: { currency: "SEK", vat_rate: sel.vatRate ?? 25, rut_enabled: !!sel.rutEligible },
          service_id: sel.id, frequency, inputs, addons: [], applyRUT: true, coupon: undefined, answers
        })
      });
  const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.statusText);
  setQuote(j as QuoteBreakdown);
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
  }

  const invariantOK = useMemo(() => {
    if (!quote) return null;
  const subtotal = quote.subtotal_ex_vat_minor | 0;
    const sum = (subtotal|0) + (quote.vat_minor|0) + (quote.rut_minor|0) + (quote.discount_minor|0);
    return (quote.total_minor|0) === sum;
  }, [quote]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Public Widget</h1>

      <div className="flex items-center gap-2">
        <span className="text-sm">Tenant</span>
        <input className="border rounded px-2 py-1" value={tenant} onChange={e=>setTenant(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="text-sm">Service
          <select className="border rounded px-2 py-1 ml-2" value={selId} onChange={e=>{ setSelId(e.target.value); setQuote(null); }}>
            <option value="">Select</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name} · {s.model}</option>)}
          </select>
        </label>
      </div>

      {sel && (
        <div className="space-y-3 border rounded p-4">
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm">Frequency
              <select className="border rounded px-2 py-1 ml-2" value={frequency} onChange={e=>setFrequency(e.target.value as FrequencyKey)}>
                <option value="one_time">one_time</option>
                <option value="weekly">weekly</option>
                <option value="biweekly">biweekly</option>
                <option value="monthly">monthly</option>
              </select>
            </label>
            {expects.needsArea && (
              <label className="text-sm">Area (sqm)
                <input type="number" className="border rounded px-2 py-1 ml-2 w-24" min={0} value={(inputs as Record<string, unknown>).area as number ?? 50}
                       onChange={e=>setInputs(prev=>({ ...(prev||{}), area: Number(e.target.value||0) }))} />
              </label>
            )}
          </div>

      {(expects.windowTypes.length>0 || expects.roomTypes.length>0) && (
            <div className="space-y-2">
              <div className="font-medium text-sm">Counts</div>
              <div className="grid md:grid-cols-3 gap-2">
                {(expects.windowTypes.length ? expects.windowTypes : expects.roomTypes).map((t: { key:string; name:string }) => (
                  <label key={t.key} className="text-sm flex items-center justify-between gap-2 border rounded px-2 py-1">
                    <span>{t.name}</span>
                    <input type="number" min={0} className="border rounded px-2 py-1 w-24"
           value={(inputs as Record<string, unknown>)[t.key] as number ?? 0}
                           onChange={e=>setInputs(prev=>({ ...(prev||{}), [t.key]: Number(e.target.value||0) }))} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {expects.booleanMods.length>0 && (
            <div className="space-y-1">
              <div className="font-medium text-sm">Questions</div>
              <div className="grid md:grid-cols-3 gap-2">
        {expects.booleanMods.map((m) => (
                  <label key={m.key} className="text-sm flex items-center gap-2 border rounded px-2 py-1">
                    <input type="checkbox" checked={!!(answers as Record<string, unknown>)[m.condition?.answerKey]}
                           onChange={e=>setAnswers(prev=>({ ...(prev||{}), [m.condition.answerKey]: e.target.checked }))} />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={runQuote} className="px-4 py-2 rounded bg-black text-white">Get Quote</button>
          </div>

          {note && <div className="text-sm text-red-600">{note}</div>}

          {quote && (
            <div className="text-sm mt-3">
              <div>status: 200 · invariant: {invariantOK ? "✅" : "❌"}</div>
              <pre className="text-xs bg-gray-50 p-2 rounded mt-2 overflow-auto max-h-64">{JSON.stringify(quote, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
