"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";

interface Service {
  key: string;
  name: string;
  model: string;
  is_active: boolean;
}

export default function QuoteDebug() {
  const [json, setJson] = useState<object | null>(null);
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState("basic_cleaning");

  useEffect(() => {
    // Load available services
    fetch("/api/admin/services")
      .then(res => res.json())
      .then(data => {
        if (data.items) {
          setServices(data.items.filter((s: Service) => s.is_active));
          if (data.items.length > 0) {
            setSelectedService(data.items[0].key);
          }
        }
      })
      .catch(console.error);
  }, []);
  async function run() {
    setLoading(true);
    setJson(null);
    const body = {
      tenantId: "00000000-0000-0000-0000-000000000001",
      serviceKey: selectedService,
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Quote Debug</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/widget/demo-cleaning" style={{ color: "#2563eb", textDecoration: "none" }}>
            → Widget Test
          </Link>
          <Link href="/admin/services" style={{ color: "#2563eb", textDecoration: "none" }}>
            → Manage Services
          </Link>
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, maxWidth: 460 }}>
        <label>
          Service: 
          <select 
            value={selectedService} 
            onChange={(e) => setSelectedService(e.target.value)}
            style={{ marginLeft: 8, padding: "4px 8px" }}
          >
            {services.map(service => (
              <option key={service.key} value={service.key}>
                {service.name} ({service.model})
              </option>
            ))}
          </select>
        </label>
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
