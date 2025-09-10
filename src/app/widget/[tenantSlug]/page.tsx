"use client";
import React, { useEffect, useMemo, useState } from "react";

type ServiceUI = {
  key: string; name: string; model: "per_sqm"|"hourly"|"fixed"|"per_room"|"windows";
  ui: { expects: string[]; addons: { key:string; name:string; type:"fixed"|"per_unit"; amount:number }[];
        frequency: Record<string, number>; rutEnabled: boolean }
};
type PublicServicesResp = {
  tenant: { id:string; slug:string; name:string; currency:string; vat_rate:number; rut_enabled:boolean };
  services: ServiceUI[];
};

export default function WidgetPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const [resolvedParams, setResolvedParams] = useState<{ tenantSlug: string } | null>(null);
  const [data, setData] = useState<PublicServicesResp | null>(null);
  const [serviceKey, setServiceKey] = useState<string>("");
  const [frequency, setFrequency] = useState<"one_time"|"monthly"|"biweekly"|"weekly">("one_time");
  const [applyRUT, setApplyRUT] = useState(false);
  const [inputs, setInputs] = useState<Record<string, number>>({});
  const [addons, setAddons] = useState<Record<string, number>>({}); // quantity for per_unit, 1 for fixed
  const [quote, setQuote] = useState<any>(null);
  const [busyQuote, setBusyQuote] = useState(false);
  const [busyBook, setBusyBook] = useState(false);
  const [email, setEmail] = useState("test@example.com");
  const [zip, setZip] = useState("11122");

  // Resolve params promise
  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  // Load public services
  useEffect(() => {
    if (!resolvedParams) return;
    fetch(`/api/public/services?tenantSlug=${resolvedParams.tenantSlug}`)
      .then(r => r.json()).then(setData).catch(() => setData(null));
  }, [resolvedParams]);

  const svc = useMemo(() => data?.services.find(s => s.key === serviceKey), [data, serviceKey]);
  useEffect(() => {
    if (data?.services?.length && !serviceKey) setServiceKey(data.services[0].key);
  }, [data, serviceKey]);

  function toggleAddon(aKey: string, type: "fixed"|"per_unit") {
    setAddons(prev => {
      const next = { ...prev };
      if (!(aKey in next)) next[aKey] = type === "fixed" ? 1 : 1;
      else delete next[aKey];
      return next;
    });
  }

  async function runQuote() {
    if (!data || !svc) return;
    setBusyQuote(true);
    setQuote(null);
    const body = {
      tenantId: data.tenant.id,
      serviceKey: svc.key,
      locale: "sv-SE",
      frequency,
      inputs,
      addons: Object.entries(addons).map(([k, qty]) => ({
        key: k, ...(svc.ui.addons.find(a=>a.key===k)?.type === "per_unit" ? { quantity: qty } : {})
      })),
      applyRUT: applyRUT && (data.tenant.rut_enabled && svc.ui.rutEnabled)
    };
    const res = await fetch("/api/pricing/quote", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body)
    });
    const j = await res.json();
    setQuote(j);
    setBusyQuote(false);
  }

  async function createBooking() {
    if (!data || !svc) return;
    setBusyBook(true);
    const body = {
      quote: {
        tenantId: data.tenant.id,
        serviceKey: svc.key,
        locale: "sv-SE",
        frequency,
        inputs,
        addons: Object.entries(addons).map(([k, qty]) => ({
          key: k, ...(svc.ui.addons.find(a=>a.key===k)?.type === "per_unit" ? { quantity: qty } : {})
        })),
        applyRUT: applyRUT && (data.tenant.rut_enabled && svc.ui.rutEnabled)
      },
      customer: { email },
      address: { zip }
    };
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body)
    });
    const j = await res.json();
    setBusyBook(false);
    alert(res.ok ? `Booking created: ${j.id}` : `Error: ${j.error ?? "UNKNOWN"}`);
  }

  if (!resolvedParams) {
    return <div style={{ fontFamily: "ui-sans-serif", padding: 16 }}>Loading...</div>;
  }

  return (
    <div style={{ fontFamily: "ui-sans-serif", padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>{data?.tenant.name ?? "Loading…"} – Booking Widget</h1>

      {/* Service selection */}
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <label>
          Service:
          <select value={serviceKey} onChange={e=>{ setServiceKey(e.target.value); setQuote(null); }}>
            {data?.services.map(s => <option key={s.key} value={s.key}>{s.name} ({s.model})</option>)}
          </select>
        </label>

        {/* Inputs based on model */}
        {svc?.ui.expects.includes("sqm") && (
          <label>Area (sqm): <input type="number" min={0} onChange={e=>setInputs(i=>({ ...i, sqm: Number(e.target.value||0) }))} defaultValue={75} /></label>
        )}
        {svc?.ui.expects.includes("hours") && (
          <label>Hours: <input type="number" min={1} onChange={e=>setInputs(i=>({ ...i, hours: Number(e.target.value||1) }))} defaultValue={2} /></label>
        )}

        {/* Add-ons */}
        {!!svc?.ui.addons.length && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Add-ons</div>
            {svc.ui.addons.map(a => (
              <label key={a.key} style={{ display: "block" }}>
                <input type="checkbox" onChange={()=>toggleAddon(a.key, a.type)} /> {a.name}
                {a.type === "per_unit" && (a.key in addons) && (
                  <> × <input type="number" min={1} defaultValue={1} style={{ width: 60 }}
                    onChange={e=>setAddons(prev=>({ ...prev, [a.key]: Number(e.target.value||1) }))} /></>
                )}
              </label>
            ))}
          </div>
        )}

        {/* Frequency + RUT */}
        <label>
          Frequency:
          <select value={frequency} onChange={e=>setFrequency(e.target.value as any)}>
            <option value="one_time">One time</option>
            <option value="monthly">Monthly</option>
            <option value="biweekly">Biweekly</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        {(data?.tenant.rut_enabled && svc?.ui.rutEnabled) && (
          <label><input type="checkbox" checked={applyRUT} onChange={e=>setApplyRUT(e.target.checked)} /> Apply RUT</label>
        )}
        <button onClick={runQuote} disabled={busyQuote || !serviceKey}>{busyQuote ? "Calculating…" : "Calculate price"}</button>
      </div>

      {/* Price display */}
      <div style={{ background:"#f7f7f7", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Price</div>
        <pre style={{ whiteSpace:"pre-wrap" }}>{quote ? JSON.stringify(quote, null, 2) : "No quote yet"}</pre>
      </div>

      {/* Customer + booking */}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <div style={{ fontWeight: 600 }}>Your details</div>
        <label>Email <input type="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <label>ZIP <input value={zip} onChange={e=>setZip(e.target.value)} /></label>
        <button onClick={createBooking} disabled={busyBook || !quote}>{busyBook ? "Submitting…" : "Request booking"}</button>
      </div>
    </div>
  );
}
