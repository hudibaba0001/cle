"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

interface BookingData {
  id: string;
  status: string;
  service_key: string;
  amount_due_minor: number;
  created_at: string;
  reject_reason?: string;
  customer: {
    email: string;
    phone?: string;
  };
  address: {
    zip: string;
    street?: string;
    city?: string;
  };
  service_snapshot: {
    key: string;
    quote_request: unknown;
  };
  price_snapshot: unknown;
}

export default function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);
  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sStart, setSStart] = useState("");
  const [sEnd, setSEnd] = useState("");
  const [hours, setHours] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Resolve params promise
  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  async function load() {
    if (!resolvedParams) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/bookings/${resolvedParams.id}`);
      const j = await r.json();
      setData(j.item || null);
    } catch (error) {
      console.error("Failed to load booking:", error);
      setData(null);
    }
    setLoading(false);
  }
  
  useEffect(() => { 
    if (resolvedParams) load(); 
  }, [resolvedParams]);

  async function accept() {
    if (!resolvedParams || actionLoading) return;
    setActionLoading(true);
    const body: Record<string, unknown> = {};
    if (sStart) body.scheduled_start = new Date(sStart).toISOString();
    if (sEnd) body.scheduled_end = new Date(sEnd).toISOString();
    if (hours) body.estimated_hours = Number(hours);
    
    try {
      const r = await fetch(`/api/bookings/${resolvedParams.id}/accept`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const error = await r.json();
        alert(`Accept failed: ${error.message || error.error || "Unknown error"}`);
      } else {
        await load();
      }
    } catch (error) {
      alert(`Accept failed: ${error}`);
    }
    setActionLoading(false);
  }

  async function reject() {
    if (!resolvedParams || actionLoading) return;
    if (!reason || reason.length < 2) return alert("Provide a reason (at least 2 characters)");
    setActionLoading(true);
    
    try {
      const r = await fetch(`/api/bookings/${resolvedParams.id}/reject`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ reason })
      });
      if (!r.ok) {
        const error = await r.json();
        alert(`Reject failed: ${error.message || error.error || "Unknown error"}`);
      } else {
        await load();
        setReason(""); // Clear reason after successful reject
      }
    } catch (error) {
      alert(`Reject failed: ${error}`);
    }
    setActionLoading(false);
  }

  if (!resolvedParams) return <div style={{ padding:24 }}>Loading...</div>;
  if (loading) return <div style={{ padding:24 }}>Loading booking details...</div>;
  if (!data) return <div style={{ padding:24 }}>Booking not found</div>;

  return (
    <div style={{ padding: 24, fontFamily: "ui-sans-serif", maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Booking {data.id}</h1>
        <Link href="/admin/bookings" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to Bookings
        </Link>
      </div>
      
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ padding: 16, backgroundColor: "#f9fafb", borderRadius: 8 }}>
          <div><strong>Status:</strong> <span style={{
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "14px",
            backgroundColor: data.status === "pending" ? "#fef3c7" : 
                           data.status === "accepted" ? "#d1fae5" :
                           data.status === "rejected" ? "#fecaca" : "#f3f4f6",
            color: data.status === "pending" ? "#92400e" :
                   data.status === "accepted" ? "#065f46" :
                   data.status === "rejected" ? "#991b1b" : "#374151"
          }}>
            {data.status}
          </span></div>
          <div style={{ marginTop: 8 }}><strong>Created:</strong> {new Date(data.created_at).toLocaleString()}</div>
        </div>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: "0 0 12px 0" }}>Customer</h3>
          <div><strong>Email:</strong> {data.customer.email}</div>
          {data.customer.phone && <div><strong>Phone:</strong> {data.customer.phone}</div>}
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: "0 0 12px 0" }}>Address</h3>
          <div><strong>ZIP:</strong> {data.address.zip}</div>
          {data.address.street && <div><strong>Street:</strong> {data.address.street}</div>}
          {data.address.city && <div><strong>City:</strong> {data.address.city}</div>}
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: "0 0 12px 0" }}>Service Details</h3>
          <div><strong>Service:</strong> {data.service_key}</div>
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", color: "#6b7280" }}>Quote Request</summary>
            <pre style={{ marginTop: 8, fontSize: 12, backgroundColor: "#f3f4f6", padding: 8, borderRadius: 4, overflow: "auto" }}>
              {JSON.stringify(data.service_snapshot.quote_request, null, 2)}
            </pre>
          </details>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: "0 0 12px 0" }}>Price Breakdown</h3>
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>
            <strong>Total Amount:</strong> {(data.amount_due_minor/100).toFixed(2)} SEK
          </div>
          <details>
            <summary style={{ cursor: "pointer", color: "#6b7280" }}>Price Details</summary>
            <pre style={{ marginTop: 8, fontSize: 12, backgroundColor: "#f3f4f6", padding: 8, borderRadius: 4, overflow: "auto" }}>
              {JSON.stringify(data.price_snapshot, null, 2)}
            </pre>
          </details>
        </section>

        {data.status === "pending" && (
          <section style={{ border: "2px solid #10b981", borderRadius: 8, padding: 16, backgroundColor: "#f0fdf4" }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#065f46" }}>Accept Booking</h3>
            <div style={{ display:"grid", gap:8, maxWidth:360 }}>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ marginBottom: 4 }}>Scheduled Start:</span>
                <input 
                  type="datetime-local" 
                  value={sStart} 
                  onChange={e=>setSStart(e.target.value)}
                  style={{ padding: "8px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ marginBottom: 4 }}>Scheduled End:</span>
                <input 
                  type="datetime-local" 
                  value={sEnd} 
                  onChange={e=>setSEnd(e.target.value)}
                  style={{ padding: "8px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ marginBottom: 4 }}>Estimated Hours:</span>
                <input 
                  type="number" 
                  min={0.5} 
                  step={0.5} 
                  value={hours} 
                  onChange={e=>setHours(e.target.value ? Number(e.target.value) : "")}
                  style={{ padding: "8px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              </label>
              <button 
                onClick={accept}
                disabled={actionLoading}
                style={{ 
                  padding: "12px", 
                  backgroundColor: "#10b981", 
                  color: "white", 
                  border: "none", 
                  borderRadius: 4, 
                  cursor: actionLoading ? "not-allowed" : "pointer",
                  opacity: actionLoading ? 0.6 : 1
                }}
              >
                {actionLoading ? "Processing..." : "Accept Booking"}
              </button>
            </div>
          </section>
        )}

        {data.status === "pending" && (
          <section style={{ border: "2px solid #ef4444", borderRadius: 8, padding: 16, backgroundColor: "#fef2f2" }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#dc2626" }}>Reject Booking</h3>
            <div style={{ display:"grid", gap:8, maxWidth:360 }}>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ marginBottom: 4 }}>Reason (internal use):</span>
                <textarea
                  value={reason} 
                  onChange={e=>setReason(e.target.value)} 
                  placeholder="Enter reason for rejection..."
                  rows={3}
                  style={{ padding: "8px", border: "1px solid #d1d5db", borderRadius: 4, resize: "vertical" }}
                />
              </label>
              <button 
                onClick={reject}
                disabled={actionLoading || !reason || reason.length < 2}
                style={{ 
                  padding: "12px", 
                  backgroundColor: "#ef4444", 
                  color: "white", 
                  border: "none", 
                  borderRadius: 4, 
                  cursor: (actionLoading || !reason || reason.length < 2) ? "not-allowed" : "pointer",
                  opacity: (actionLoading || !reason || reason.length < 2) ? 0.6 : 1
                }}
              >
                {actionLoading ? "Processing..." : "Reject Booking"}
              </button>
            </div>
          </section>
        )}

        {data.reject_reason && (
          <section style={{ border: "1px solid #f59e0b", borderRadius: 8, padding: 16, backgroundColor: "#fffbeb" }}>
            <h3 style={{ margin: "0 0 8px 0", color: "#92400e" }}>Rejection Reason</h3>
            <div style={{ color: "#92400e" }}>{data.reject_reason}</div>
          </section>
        )}
      </div>
    </div>
  );
}
