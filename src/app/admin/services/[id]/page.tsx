"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function fmtMinor(minor: number, currency = "SEK") {
  return new Intl.NumberFormat("en-SE", { style: "currency", currency }).format(minor / 100);
}

type ServiceRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  model: string;
  config: unknown;
  created_at: string;
};

type QuoteLine = { key: string; label: string; amount_minor: number; rutEligible?: boolean };

type Quote = {
  currency: string;
  model: string;
  lines: QuoteLine[];
  subtotal_ex_vat_minor: number;
  vat_minor: number;
  rut_minor: number;
  discount_minor: number;
  total_minor: number;
};

export default function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);
  useEffect(() => { params.then(setResolvedParams); }, [params]);

  const search = useSearchParams();
  const tenant = search.get("tenant") || "demo-tenant";

  const [svc, setSvc] = useState<ServiceRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [qLoading, setQLoading] = useState(false);

  useEffect(() => {
    if (!resolvedParams) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await fetch(`/api/admin/services/${resolvedParams.id}`, { headers: { "x-tenant-id": tenant }, cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || r.statusText);
        setSvc(j as ServiceRow);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally { setLoading(false); }
    })();
  }, [resolvedParams, tenant]);

  const invariantOK = useMemo(() => {
    if (!quote) return null;
    const expect = quote.subtotal_ex_vat_minor + quote.vat_minor + quote.rut_minor + quote.discount_minor;
    return expect === quote.total_minor;
  }, [quote]);

  async function runTest() {
    if (!svc) return;
    setQLoading(true); setQErr(null); setQuote(null);
    try {
      // Use a very small, valid payload for universal_multiplier
      const res = await fetch("/api/pricing/v2/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenant },
        body: JSON.stringify({
          tenant: { currency: "SEK", vat_rate: 25, rut_enabled: true },
          service: svc.config,
          frequency: "monthly",
          inputs: { area: 45 },
          addons: [],
          applyRUT: true,
          coupon: undefined,
          answers: { has_pets: true }
        })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || res.statusText);
      setQuote(j as Quote);
    } catch (e) {
      setQErr(e instanceof Error ? e.message : String(e));
    } finally { setQLoading(false); }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Service Detail</h1>
      <div className="text-sm text-gray-500">Tenant: {tenant}</div>

      {loading && <div>Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {svc && (
        <div className="space-y-2">
          <div className="font-semibold">{svc.name}</div>
          <div className="text-gray-600 text-sm">{svc.slug} · {svc.model}</div>
          <button className="px-3 py-2 rounded bg-black text-white" onClick={runTest} disabled={qLoading}>
            {qLoading ? "Running…" : "Run Pricing Test"}
          </button>
        </div>
      )}

      {qErr && <div className="text-red-600">{qErr}</div>}
      {quote && (
        <div className="border rounded p-3 space-y-2">
          <div className="font-semibold">Breakdown</div>
          <ul className="text-sm list-disc pl-5">
            {quote.lines.map(l => (
              <li key={l.key}>{l.label}: {fmtMinor(l.amount_minor)}</li>
            ))}
          </ul>
          <div className="text-sm">Subtotal ex VAT: {fmtMinor(quote.subtotal_ex_vat_minor)}</div>
          <div className="text-sm">VAT: {fmtMinor(quote.vat_minor)}</div>
          <div className="text-sm">RUT: {fmtMinor(quote.rut_minor)}</div>
          <div className="text-sm">Discount: {fmtMinor(quote.discount_minor)}</div>
          <div className="font-medium">Total: {fmtMinor(quote.total_minor)}</div>
          <div className={invariantOK ? "text-green-700" : "text-red-700"}>
            {invariantOK ? "✅ invariant" : "❌ invariant broken"}
          </div>
        </div>
      )}
    </div>
  );
}
