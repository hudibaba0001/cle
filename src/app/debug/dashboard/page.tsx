"use client";
import React from "react";

type TestStatus = "idle" | "running" | "pass" | "fail";

type QuoteResp = {
  currency: string;
  model: string;
  lines: { key: string; label: string; rutEligible?: boolean; amount_minor?: number; rut_eligible?: boolean; ex_vat_minor?: number }[];
  subtotal_ex_vat_minor?: number;
  subtotal_minor?: number;
  vat_minor: number;
  rut_minor: number;
  discount_minor: number;
  total_minor: number;
};

function Card(props: { title: string; status: TestStatus; children?: React.ReactNode; onRun?: () => void }) {
  const { title, status, children, onRun } = props;
  const color = status === "pass" ? "#16a34a" : status === "fail" ? "#dc2626" : status === "running" ? "#2563eb" : "#6b7280";
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color }}>{status === "pass" ? "✅" : status === "fail" ? "❌" : status === "running" ? "⏳" : "•"}</span>
          {onRun && (
            <button onClick={onRun} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}>Run</button>
          )}
        </div>
      </div>
      <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

export default function DebugDashboardPage() {
  const [tenantId, setTenantId] = React.useState("demo-tenant");
  const [serviceId, setServiceId] = React.useState("");
  const [health, setHealth] = React.useState<TestStatus>("idle");
  const [badQuote, setBadQuote] = React.useState<TestStatus>("idle");
  const [goodQuote, setGoodQuote] = React.useState<TestStatus>("idle");
  const [rules, setRules] = React.useState<TestStatus>("idle");
  const [booking, setBooking] = React.useState<TestStatus>("idle");
  const [logs, setLogs] = React.useState<Record<string, string>>({});

  const append = (k: string, msg: string) => setLogs((p) => ({ ...p, [k]: msg }));

  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e));

  const runHealth = async () => {
    setHealth("running");
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      const ok = r.status === 200;
      append("health", `status=${r.status}`);
      setHealth(ok ? "pass" : "fail");
    } catch (e: unknown) {
      append("health", errorMessage(e));
      setHealth("fail");
    }
  };

  const runBadQuote = async () => {
    setBadQuote("running");
    try {
      const r = await fetch("/api/pricing/v2/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const text = await r.text();
      append("bad", `status=${r.status}\n${text}`);
      const ok = [400, 401, 422].includes(r.status) && (text.trim().startsWith("{") || r.headers.get("content-type")?.includes("application/json"));
      setBadQuote(ok ? "pass" : "fail");
    } catch (e: unknown) {
      append("bad", errorMessage(e));
      setBadQuote("fail");
    }
  };

  const validPayload = () => ({
    tenant: { currency: "SEK", vat_rate: 25, rut_enabled: true },
    service: {
      model: "universal_multiplier",
      name: "Per sqm",
      ratePerSqm: 2.5,
      frequencyMultipliers: { one_time: 1.0, weekly: 1.0, biweekly: 1.15, monthly: 1.4 },
      vatRate: 25,
      rutEligible: true,
      addons: [],
      fees: [{ key: "travel", name: "Travel fee", amount: 50, rutEligible: false }],
      modifiers: [
        {
          key: "pet",
          label: "Pets present",
          condition: { type: "boolean", when: true, answerKey: "has_pets" },
          effect: { target: "subtotal_before_modifiers", mode: "percent", value: 10, direction: "increase", rutEligible: true, label: "+10% pets" },
        },
      ],
      minimum: 0,
    },
    frequency: "monthly",
    inputs: { area: 50 },
    addons: [],
    applyRUT: true,
    coupon: { code: "SAVE10", type: "percent", value: 10 },
    answers: { has_pets: true },
  });

  const runGoodQuote = async () => {
    setGoodQuote("running");
    try {
      const body = validPayload();
      const r = await fetch("/api/pricing/v2/quote", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) {
        append("good", `status=${r.status}\n${text}`);
        setGoodQuote("fail");
        return;
      }
      const json = JSON.parse(text) as QuoteResp;
      const subtotal = (json.subtotal_ex_vat_minor ?? json.subtotal_minor) || 0;
      const sum = (subtotal || 0) + (json.vat_minor || 0) + (json.rut_minor || 0) + (json.discount_minor || 0);
      const invariant = json.total_minor === sum;
      const signs = (json.rut_minor ?? 0) <= 0 && (json.discount_minor ?? 0) <= 0;
      const lines = Array.isArray(json.lines) ? json.lines : [];
      const getRutEligible = (l: QuoteResp["lines"][number]): boolean | undefined =>
        typeof l.rutEligible === "boolean" ? l.rutEligible : l.rut_eligible;
      const getAmountMinor = (l: QuoteResp["lines"][number]): number | undefined =>
        typeof l.amount_minor === "number" ? l.amount_minor : l.ex_vat_minor;
      const hasRutTrue = lines.some((l) => getRutEligible(l) === true);
      const hasRutFalse = lines.some((l) => getRutEligible(l) === false);
      const sample = lines
        .slice(0, 6)
        .map((l) => `${l.key}:${String(getRutEligible(l))}:${String(getAmountMinor(l))}`)
        .join(" | ");
      append(
        "good",
        `currency=${json.currency}\nsubtotal_ex_vat=${subtotal} vat=${json.vat_minor} rut=${json.rut_minor} discount=${json.discount_minor} total=${json.total_minor}\n` +
          `invariant=${invariant} signs=${signs} lines sample: ${sample} (hasRutTrue=${hasRutTrue}, hasRutFalse=${hasRutFalse})`
      );
      setGoodQuote(invariant && signs ? "pass" : "fail");
    } catch (e: unknown) {
      append("good", errorMessage(e));
      setGoodQuote("fail");
    }
  };

  const runRules = async () => {
    setRules("running");
    try {
      const r = await fetch("/debug/rules", { cache: "no-store" });
      const txt = await r.text();
      const ok = r.status === 200 && !txt.includes("❌");
      append("rules", `status=${r.status} hasFail=${txt.includes("❌")}`);
      setRules(ok ? "pass" : "fail");
    } catch (e: unknown) {
      append("rules", errorMessage(e));
      setRules("fail");
    }
  };

  const runBooking = async () => {
    setBooking("running");
    try {
      if (!serviceId) {
        append("booking", "service_id required to run booking test");
        setBooking("fail");
        return;
      }
      // Minimal demo payload; may require auth in your env
      const create = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ service_id: serviceId, customer: { email: "test@example.com" }, status: "pending" }),
      });
  const created: unknown = await create.json().catch(() => ({} as unknown));
      if (!create.ok) {
        append("booking", `create status=${create.status}\n${JSON.stringify(created)}`);
        setBooking(create.status === 401 || create.status === 403 ? "pass" : "fail");
        return;
      }
  const id = (created as { id?: string; booking?: { id?: string } })?.id ?? (created as { booking?: { id?: string } })?.booking?.id;
      if (!id) {
        append("booking", `create OK but no id in body: ${JSON.stringify(created)}`);
        setBooking("fail");
        return;
      }
      const rej1 = await fetch(`/api/bookings/${id}/reject`, { method: "POST", headers: { "x-tenant-id": tenantId } });
      const rej2 = await fetch(`/api/bookings/${id}/reject`, { method: "POST", headers: { "x-tenant-id": tenantId } });
      const ok = rej1.ok && (rej2.status === 409 || rej2.ok);
      append("booking", `reject1=${rej1.status} reject2=${rej2.status}`);
      setBooking(ok ? "pass" : "fail");
    } catch (e: unknown) {
      append("booking", errorMessage(e));
      setBooking("fail");
    }
  };

  const runAll = async () => {
    await runHealth();
    await runBadQuote();
    await runGoodQuote();
    await runRules();
  };

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Debug Dashboard</h1>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Tenant ID
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 6 }} />
        </label>
        <button onClick={runAll} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}>Run All</button>
      </div>

      <Card title="Health" status={health} onRun={runHealth}>
        {logs.health}
      </Card>
      <Card title="Bad Quote (no tenant)" status={badQuote} onRun={runBadQuote}>
        {logs.bad}
      </Card>
      <Card title="Good Quote (with tenant + invariant)" status={goodQuote} onRun={runGoodQuote}>
        {logs.good}
      </Card>
      <Card title="Rules Page (/debug/rules)" status={rules} onRun={runRules}>
        {logs.rules}
      </Card>

      <div style={{ height: 1, background: "#e5e7eb", margin: "16px 0" }} />
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          service_id
          <input value={serviceId} onChange={(e) => setServiceId(e.target.value)} placeholder="optional" style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 6 }} />
        </label>
        <button onClick={runBooking} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}>Run Booking Test</button>
      </div>
      <Card title="Booking Idempotency (optional)" status={booking}>
        {logs.booking}
      </Card>
    </div>
  );
}
