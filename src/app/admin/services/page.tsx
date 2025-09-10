"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type ServiceRow = {
  id: string;
  name: string;
  slug: string;
  model: string;
  created_at: string;
};

export default function AdminServicesPage() {
  const [tenant, setTenant] = useState("demo-tenant");
  const [items, setItems] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setLoading(true); setNote(null);
    try {
      const r = await fetch("/api/admin/services", { headers: { "x-tenant-id": tenant }, cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.statusText);
      setItems((j.items ?? []) as ServiceRow[]);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  useEffect(() => { load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDemo() {
    setLoading(true); setNote(null);
    try {
      const body = {
        name: "Standard Apartment Cleaning",
        config: {
          model: "universal_multiplier",
          name: "Per sqm",
          ratePerSqm: 2.5,
          frequencyMultipliers: { one_time: 1.0, weekly: 1.0, biweekly: 1.15, monthly: 1.4 },
          vatRate: 25,
          rutEligible: true,
          addons: [],
          fees: [{ key: "travel", name: "Travel fee", amount: 50, rutEligible: false }],
          modifiers: [{
            key: "pet",
            label: "Pets present",
            condition: { type: "boolean", when: true, answerKey: "has_pets" },
            effect: { target: "subtotal_before_modifiers", mode: "percent", value: 10, direction: "increase", rutEligible: true, label: "+10% pets" }
          }],
          minimum: 0
        }
      };
      const r = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenant },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.statusText);
      setItems(prev => [j as ServiceRow, ...prev]);
      setNote("Created demo service.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin · Services</h1>
        <div className="flex gap-2">
          <input className="border rounded px-2 py-1" value={tenant} onChange={e=>setTenant(e.target.value)} />
          <button onClick={load} className="px-3 py-2 rounded bg-gray-100">Reload</button>
          <button onClick={createDemo} className="px-3 py-2 rounded bg-black text-white" disabled={loading}>
            {loading ? "Working…" : "Create Demo Service"}
          </button>
        </div>
      </div>

      {note && <div className="text-sm text-gray-600">{note}</div>}

      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left p-2">Name</th>
            <th className="text-left p-2">Slug</th>
            <th className="text-left p-2">Model</th>
            <th className="text-left p-2">Created</th>
            <th className="text-left p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t">
              <td className="p-2">{it.name}</td>
              <td className="p-2">{it.slug}</td>
              <td className="p-2">{it.model}</td>
              <td className="p-2">{new Date(it.created_at).toLocaleString()}</td>
              <td className="p-2">
                <Link className="text-blue-600 underline" href={`/admin/services/${it.id}?tenant=${tenant}`}>Open</Link>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={5} className="p-4 text-center text-gray-500">No services yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
