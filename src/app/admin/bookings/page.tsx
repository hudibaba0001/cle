"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

type Row = { id:string; status:string; service_key:string; amount_due_minor:number; created_at:string; email?:string; zip?:string };

export default function AdminBookings() {
  const [status, setStatus] = useState<"pending"|"accepted"|"rejected"|"cancelled"|"expired"|"">("");
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  async function load(p=1, s=status) {
    const r = await fetch(`/api/admin/bookings?${new URLSearchParams({ page: String(p), status: s || "" })}`);
    const j = await r.json();
    setItems(j.items ?? []); setTotal(j.total ?? 0); setPage(j.page ?? p);
  }
  useEffect(() => { load(1); }, []);
  useEffect(() => { load(1, status); }, [status]);

  return (
    <div style={{ padding: 24, fontFamily:"ui-sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Admin – Bookings</h1>
        <Link href="/admin/services" style={{ color: "#2563eb", textDecoration: "none" }}>
          → Manage Services
        </Link>
      </div>
      
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <label>Status:
          <select value={status} onChange={e=>setStatus(e.target.value as typeof status)} style={{ marginLeft: 8, padding: "4px 8px" }}>
            <option value="">All</option>
            <option value="pending">pending</option>
            <option value="accepted">accepted</option>
            <option value="rejected">rejected</option>
            <option value="cancelled">cancelled</option>
            <option value="expired">expired</option>
          </select>
        </label>
        <button onClick={()=>load(page, status)} style={{ padding: "4px 12px" }}>Refresh</button>
      </div>
      
      <div style={{ overflowX: "auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", border: "1px solid #ddd" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={{textAlign:"left", padding: "8px", border: "1px solid #ddd"}}>Created</th>
              <th style={{textAlign:"left", padding: "8px", border: "1px solid #ddd"}}>Email</th>
              <th style={{textAlign:"left", padding: "8px", border: "1px solid #ddd"}}>ZIP</th>
              <th style={{textAlign:"left", padding: "8px", border: "1px solid #ddd"}}>Service</th>
              <th style={{textAlign:"left", padding: "8px", border: "1px solid #ddd"}}>Status</th>
              <th style={{textAlign:"right", padding: "8px", border: "1px solid #ddd"}}>Amount (SEK)</th>
              <th style={{textAlign:"center", padding: "8px", border: "1px solid #ddd"}}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(r=>(
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>{r.email ?? "-"}</td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>{r.zip ?? "-"}</td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>{r.service_key}</td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    backgroundColor: r.status === "pending" ? "#fef3c7" : 
                                   r.status === "accepted" ? "#d1fae5" :
                                   r.status === "rejected" ? "#fecaca" : "#f3f4f6",
                    color: r.status === "pending" ? "#92400e" :
                           r.status === "accepted" ? "#065f46" :
                           r.status === "rejected" ? "#991b1b" : "#374151"
                  }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: "8px", border: "1px solid #ddd", textAlign: "right" }}>{(r.amount_due_minor/100).toFixed(2)}</td>
                <td style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                  <Link href={`/admin/bookings/${r.id}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={7} style={{ padding: "16px", textAlign: "center", color: "#6b7280" }}>
                  No bookings found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div style={{ marginTop: 16, color: "#6b7280" }}>Total: {total} booking{total !== 1 ? 's' : ''}</div>
    </div>
  );
}
