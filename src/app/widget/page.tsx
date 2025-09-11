"use client";
import React, { useEffect, useMemo, useState } from "react";

type Svc = { id: string; name: string; model: string; config: any; vat_rate: number; rut_eligible: boolean; };

export default function WidgetPage() {
  const [tenant, setTenant] = useState("demo-tenant");
  const [services, setServices] = useState<Svc[]>([]);
  const [sel, setSel] = useState<Svc | null>(null);
  const [area, setArea] = useState(50);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [frequency, setFrequency] = useState<"one_time"|"weekly"|"biweekly"|"monthly">("monthly");
  const [quote, setQuote] = useState<any | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [booking, setBooking] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      setNote(null);
      const r = await fetch("/api/public/services", { headers: { "x-tenant-id": tenant }, cache: "no-store" });
      const j = await r.json();
      if (r.ok) setServices(j.items || []); else setNote(j?.error || "Load failed");
    })();
  }, [tenant]);

  const fields = useMemo(() => {
    if (!sel) return null as any;
    const c = sel.config || {};
    return {
      needsArea: ["fixed_tier","tiered_multiplier","universal_multiplier","hourly_area"].includes(sel.model),
      windowTypes: c?.windowTypes || [],
      roomTypes: c?.roomTypes || [],
      booleanMods: (c?.modifiers || []).filter((m: any) => m?.condition?.type === "boolean")
    };
  }, [sel]);

  async function runQuote() {
    if (!sel) return;
    setQuote(null); setBooking(null); setNote(null);
    const tenantInfo = { currency: "SEK", vat_rate: sel.vat_rate ?? 25, rut_enabled: !!sel.rut_eligible };
    const inputs: any = {};
    if (fields?.needsArea) inputs.area = area;
    if ((fields?.windowTypes?.length||0) > 0 || (fields?.roomTypes?.length||0) > 0) inputs.counts = counts;
    const r = await fetch("/api/public/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tenant },
      body: JSON.stringify({ tenant: tenantInfo, service_id: sel.id, frequency, inputs, answers, addons: [], applyRUT: true })
    });
    const j = await r.json();
    if (!r.ok) setNote(j?.error || "Quote error"); else setQuote(j);
  }

  async function bookNow() {
    if (!sel || !quote) return;
    const body = {
      service_id: sel.id,
      frequency,
      inputs: quote.inputs ?? { area },
      answers,
      customer: { name: "Widget Tester", email: "test@example.com", phone: "+46700000000", address: "Street 1" }
    };
    const r = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tenant, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) setNote(j?.error || "Booking error"); else setBooking(j);
  }

  const invariantOK = useMemo(() => {
    if (!quote) return null;
    const sub = (quote.subtotal_ex_vat_minor ?? quote.subtotal_minor) | 0;
    const sum = (sub|0) + (quote.vat_minor|0) + (quote.rut_minor|0) + (quote.discount_minor|0);
    return (quote.total_minor|0) === sum;
  }, [quote]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Widget</h1>
      <div className="flex gap-2 items-center">
        <label className="text-sm">Tenant</label>
        <input className="border rounded px-2 py-1" value={tenant} onChange={e=>setTenant(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Service</label>
        <select className="border rounded px-2 py-2 w-full" value={sel?.id ?? ""} onChange={e=>{
          const s = services.find(x=>x.id===e.target.value) || null;
          setSel(s); setQuote(null); setBooking(null); setCounts({});
        }}>
          <option value="">Select a service</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name} · {s.model}</option>)}
        </select>
      </div>

      {sel && (
        <div className="space-y-3 border rounded-2xl p-4">
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm">Frequency
              <select className="border rounded px-2 py-1 ml-2" value={frequency} onChange={e=>setFrequency(e.target.value as any)}>
                <option value="one_time">one_time</option>
                <option value="weekly">weekly</option>
                <option value="biweekly">biweekly</option>
                <option value="monthly">monthly</option>
              </select>
            </label>
            {fields?.needsArea && (
              <label className="text-sm">Area (sqm)
                <input type="number" min={0} className="border rounded px-2 py-1 ml-2 w-24"
                  value={area} onChange={e=>setArea(Number(e.target.value))}/>
              </label>
            )}
          </div>

          {(fields?.windowTypes?.length>0 || fields?.roomTypes?.length>0) && (
            <div>
              <div className="font-medium text-sm mb-1">Counts</div>
              <div className="grid md:grid-cols-3 gap-2">
                {(fields.windowTypes.length ? fields.windowTypes : fields.roomTypes).map((t: any) => (
                  <label key={t.key} className="text-sm flex items-center justify-between gap-2 border rounded px-2 py-1">
                    <span>{t.name}</span>
                    <input type="number" min={0} className="border rounded px-2 py-1 w-24"
                      value={counts[t.key] ?? 0}
                      onChange={e=>setCounts(prev=>({ ...prev, [t.key]: Number(e.target.value) }))}/>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* boolean answers */}
          {fields?.booleanMods?.length>0 && (
            <div>
              <div className="font-medium text-sm">Questions</div>
              <div className="grid md:grid-cols-3 gap-2 mt-1">
                {fields.booleanMods.map((m: any) => (
                  <label key={m.key} className="text-sm flex items-center gap-2 border rounded px-2 py-1">
                    <input type="checkbox"
                      checked={!!answers[m.condition?.answerKey]}
                      onChange={e=>setAnswers(prev=>({ ...prev, [m.condition.answerKey]: e.target.checked }))}/>
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={runQuote} className="px-4 py-2 rounded-2xl bg-black text-white">Get Quote</button>
            {quote && <button onClick={bookNow} className="px-4 py-2 rounded-2xl bg-emerald-600 text-white">Book</button>}
          </div>

          {note && <div className="text-sm text-red-600">{note}</div>}

          {quote && (
            <div className="text-sm mt-3">
              <div>status: 200 · invariant: {invariantOK ? "✅" : "❌"}</div>
              <pre className="text-xs bg-gray-50 p-2 rounded mt-2 overflow-auto max-h-64">{JSON.stringify(quote, null, 2)}</pre>
            </div>
          )}

          {booking && (
            <div className="text-sm mt-3">
              <div className="font-medium">Booking created</div>
              <pre className="text-xs bg-gray-50 p-2 rounded mt-2 overflow-auto">{JSON.stringify(booking, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}