"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; slug: string; status: "draft"|"published"; updated_at?: string };

export default function BookingForms() {
  const [tenantId, setTenantId] = useState<string>("demo-tenant");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/forms?status=all`, { headers: { "x-tenant-id": tenantId }, cache: "no-store" });
      const j: unknown = await res.json().catch(()=>({} as unknown));
      function isRow(v: unknown): v is Row {
        return typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string";
      }
      let items: Row[] = [];
      if (Array.isArray(j)) {
        items = (j as unknown[]).filter(isRow) as Row[];
      } else if (typeof j === "object" && j && "items" in (j as Record<string, unknown>)) {
        const arr = (j as { items?: unknown }).items;
        items = Array.isArray(arr) ? (arr as unknown[]).filter(isRow) as Row[] : [];
      }
      setRows(items);
    } catch (e) {
      setError((e as Error).message || "LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? ""));
  }, [rows]);

  async function publish(row: Row) {
    if (!tenantId) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/forms/${row.id}/publish`, { method: "POST", headers: { "x-tenant-id": tenantId } });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message || "PUBLISH_FAILED");
    } finally {
      setBusyId(null);
    }
  }

  async function unpublish(row: Row) {
    if (!tenantId) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/forms/${row.id}`, { method: "PUT", headers: { "x-tenant-id": tenantId, "content-type": "application/json" }, body: JSON.stringify({ status: "draft" }) });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message || "UNPUBLISH_FAILED");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Booking Forms</h1>
        <Link href="/admin/forms/builder" className="rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">Create Form</Link>
      </div>
      <p className="text-sm text-neutral-600">Create and publish embeddable booking forms with ZIP rules and service allow-list.</p>

      <div className="flex items-center gap-2">
        <input aria-label="Tenant ID" placeholder="Tenant ID" className="rounded-xl border px-3 py-2 text-sm" value={tenantId} onChange={(e)=>setTenantId(e.target.value)} />
        <button onClick={()=>{ void load(); }} className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">Refresh</button>
        {loading && <span className="text-sm text-neutral-500">Loading…</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Slug</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Updated</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr className="border-t"><td className="py-3 px-3" colSpan={5}>No forms yet.</td></tr>
            )}
            {sorted.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2 px-3">{r.name}</td>
                <td className="py-2 px-3">
                  <code className="rounded bg-neutral-50 px-2 py-1">{r.slug}</code>
                </td>
                <td className="py-2 px-3">
                  <span className={`rounded-full px-2 py-1 ${r.status === "published" ? "bg-green-50 text-green-700 border border-green-200" : "bg-neutral-50 text-neutral-700 border"}`}>{r.status}</span>
                </td>
                <td className="py-2 px-3">{r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}</td>
                <td className="py-2 px-3 text-right">
                  <Link href={`/admin/forms/builder?slug=${encodeURIComponent(r.slug)}`} className="rounded-xl border px-2 py-1 hover:bg-neutral-50">Edit</Link>
                  {r.status === "published" ? (
                    <button disabled={busyId===r.id} onClick={()=>unpublish(r)} className="ml-2 rounded-xl border px-2 py-1 hover:bg-neutral-50">Unpublish</button>
                  ) : (
                    <button disabled={busyId===r.id} onClick={()=>publish(r)} className="ml-2 rounded-xl border px-2 py-1 hover:bg-neutral-50">Publish</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


