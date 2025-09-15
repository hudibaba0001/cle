"use client";
import React, { useEffect, useState, useCallback } from "react";

type Row = {
  id: string; status: string; currency: string;
  total_minor: number; vat_minor: number; rut_minor: number; discount_minor: number;
  created_at: string; updated_at: string;
};

export default function AdminBookingsPage() {
  const [tenant, setTenant] = useState("demo-tenant");
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setNote(null);
    const r = await fetch("/api/admin/bookings", { headers: { "x-tenant-id": tenant }, cache: "no-store" });
    const j = await r.json();
    if (!r.ok) setNote(j?.error || "Load failed");
    else setRows(j.items ?? []);
  }, [tenant]);
  
  useEffect(() => { load(); }, [load]);

  async function reject(id: string) {
    setWorking(id); setNote(null);
    const reason = "Admin reject from UI";
    // try admin route first
    let r = await fetch(`/api/admin/bookings/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tenant },
      body: JSON.stringify({ reason })
    });
    if (r.status === 404) {
      // fallback to legacy public route signature (requires Idempotency-Key)
      r = await fetch(`/api/bookings/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenant, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ reason })
      });
    }
    const j = await r.json().catch(()=>({}));
    if (!r.ok) setNote(j?.error || `Reject failed (${r.status})`);
    await load();
    setWorking(null);
  }

  function money(minor: number, cur: string) { return `${(minor/100).toFixed(2)} ${cur}`; }
  function invariantOK(b: Row) {
    const sum = (b.total_minor|0) - (b.vat_minor|0) - (b.rut_minor|0) - (b.discount_minor|0);
    return sum >= 0; // list page just sanity-checks; detailed invariant is on quote UI
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin · Bookings</h1>
        <div className="flex gap-2 items-center">
          <input className="border rounded px-2 py-1" placeholder="Enter tenant ID" value={tenant} onChange={e=>setTenant(e.target.value)} />
          <button onClick={load} className="px-3 py-2 rounded bg-gray-100">Reload</button>
        </div>
      </div>
      {note && <div className="text-sm text-red-600">{note}</div>}

      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left p-2">ID</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Total</th>
            <th className="text-left p-2">VAT</th>
            <th className="text-left p-2">RUT</th>
            <th className="text-left p-2">Discount</th>
            <th className="text-left p-2">Created</th>
            <th className="text-left p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t">
              <td className="p-2 font-mono text-xs">{r.id}</td>
              <td className="p-2">{r.status}{invariantOK(r) ? "" : " ❌"}</td>
              <td className="p-2">{money(r.total_minor, r.currency)}</td>
              <td className="p-2">{money(r.vat_minor, r.currency)}</td>
              <td className="p-2">{money(r.rut_minor, r.currency)}</td>
              <td className="p-2">{money(r.discount_minor, r.currency)}</td>
              <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
              <td className="p-2">
                <button disabled={working===r.id || r.status!=="pending"}
                        onClick={()=>reject(r.id)}
                        className="px-3 py-1 rounded bg-black text-white disabled:opacity-50">
                  {working===r.id ? "..." : "Reject"}
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className="p-4 text-center text-gray-500" colSpan={8}>No bookings.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
