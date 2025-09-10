"use client";
import React, { useState } from "react";

export default function QuoteDebug() {
  const [json, setJson] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    setJson(null);
    const body = {
      tenantId: "00000000-0000-0000-0000-000000000001",
      serviceKey: "basic_cleaning",
      locale: "sv-SE",
      frequency: "monthly",
      inputs: { sqm: Number((document.getElementById("sqm") as HTMLInputElement).value || 75) },
      addons: [
        ...(document.getElementById("addonFridge") as HTMLInputElement).checked ? [{ key: "fridge_clean" }] : [],
        ...(document.getElementById("addonWindows") as HTMLInputElement).checked ? [{ key: "inside_windows", quantity: 3 }] : []
      ],
      applyRUT: (document.getElementById("rut") as HTMLInputElement).checked
    };
    const res = await fetch("/api/pricing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "debug-123" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    setJson(data);
    setLoading(false);
  }
  return (
    <div style={{ padding: 24, fontFamily: "ui-sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Quote Debug</h1>
      <div style={{ display: "grid", gap: 12, maxWidth: 460 }}>
        <label>Area (sqm): <input id="sqm" type="number" defaultValue={75} /></label>
        <label><input id="addonFridge" type="checkbox" defaultChecked /> Add-on: Fridge clean</label>
        <label><input id="addonWindows" type="checkbox" /> Add-on: Inside windows (qty 3)</label>
        <label><input id="rut" type="checkbox" /> Apply RUT</label>
        <button onClick={run} disabled={loading} style={{ padding: "8px 12px" }}>
          {loading ? "Calculating..." : "Calculate"}
        </button>
      </div>
      <pre style={{ marginTop: 20, background: "#f5f5f5", padding: 12, borderRadius: 8, overflowX: "auto" }}>
        {json ? JSON.stringify(json, null, 2) : "No result yet"}
      </pre>
    </div>
  );
}
