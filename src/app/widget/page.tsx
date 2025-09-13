"use client";

import React, { useEffect, useMemo, useState } from "react";

// Minimal shapes to keep this page self-contained and strictly typed
// Matches our v2.1 public APIs (services list, quote, bookings)

type FrequencyKey = "one_time" | "weekly" | "biweekly" | "monthly" | string; // allow custom keys

interface FrequencyMultipliers {
  one_time: number; weekly: number; biweekly: number; monthly: number;
  [k: string]: number;
}

interface FrequencyOption { key: string; label: string; multiplier: number }

// Dynamic Questions (subset used by the UI — we only collect answers; engine applies impacts server-side)

type DynKind = "checkbox" | "radio" | "checkbox_multi" | "text";

interface DynOption { value: string; label: string }
interface DynQuestionBase { type: DynKind; key: string; label: string }
interface DynCheckbox extends DynQuestionBase { type: "checkbox" }
interface DynRadio extends DynQuestionBase { type: "radio"; options: DynOption[] }
interface DynCheckboxMulti extends DynQuestionBase { type: "checkbox_multi"; options: DynOption[] }
interface DynText extends DynQuestionBase { type: "text"; placeholder?: string }

type DynQuestion = DynCheckbox | DynRadio | DynCheckboxMulti | DynText;

interface ServiceConfig {
  name: string;
  model: string;
  vatRate: number;
  rutEligible: boolean;
  minimum: number;
  frequencyMultipliers?: FrequencyMultipliers;
  frequencyOptions?: FrequencyOption[];
  dynamicQuestions?: DynQuestion[];
  // hourly_area specifics
  areaToHours?: { min: number; max: number; hours: number }[];
  hourlyRate?: number;
}

interface ServiceItem {
  id: string;
  name: string;
  model: string;
  active: boolean;
  config: ServiceConfig;
}

interface PublicServicesResponse { items: ServiceItem[] }

interface QuoteBody {
  tenant: { currency: string; vat_rate: number; rut_enabled: boolean };
  service_id: string;
  frequency: FrequencyKey;
  inputs: Record<string, number | string | boolean | null>;
  answers: Record<string, unknown>;
  applyRUT: boolean;
  coupon?: { code: string; type: "percent" | "fixed"; value: number };
}

interface QuoteLine { key: string; label: string; rutEligible: boolean; amount_minor: number }
interface QuoteResponse {
  currency: string; model: string;
  lines: QuoteLine[];
  subtotal_ex_vat_minor?: number; // v2.1 preferred
  subtotal_minor?: number;        // fallback if ex_vat not present
  vat_minor: number;
  rut_minor: number;
  discount_minor: number;
  total_minor: number;
}

interface BookingBody {
  service_id: string;
  frequency: FrequencyKey;
  inputs: Record<string, unknown>;
  answers: Record<string, unknown>;
  customer: { name: string; email: string; phone: string; address: { street: string; city: string; postal_code: string } };
}

interface BookingResponse { id: string; status: string; currency: string; total_minor: number; vat_minor: number; rut_minor: number; created_at: string }

// Helpers
const currencyMinorToMajor = (minor: number, ccy = "SEK") => new Intl.NumberFormat("sv-SE", { style: "currency", currency: ccy }).format((minor ?? 0) / 100);

const validateZip = (zip: string) => /^\d{5}$/.test(zip.trim());

function genIdemKey(prefix = "ui"): string { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

async function fetchJson<T>(path: string, tenantId: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "x-tenant-id": tenantId, "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || res.statusText);
  }
  return res.json();
}

function invariantText(q?: QuoteResponse): string {
  if (!q) return "—";
  const sub = (q.subtotal_ex_vat_minor ?? q.subtotal_minor ?? 0) | 0;
  const sum = sub + (q.vat_minor|0) + (q.rut_minor|0) + (q.discount_minor|0);
  return (q.total_minor|0) === sum
    ? "✅ invariant"
    : `❌ invariant (total=${q.total_minor} sum=${sum})`;
}

// UI Components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 border rounded-2xl p-4 shadow-sm">
      <h3 className="font-semibold text-lg mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 mb-3">
      <span className="text-sm text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export default function WidgetPage() {
  // Tenant + env (editable so we can target another tenant in dev/prod)
  const [tenantId, setTenantId] = useState<string>("demo-tenant");
  const [zip, setZip] = useState<string>("");
  const [zipOk, setZipOk] = useState<boolean>(false);

  // Services
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [svcError, setSvcError] = useState<string | null>(null);

  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const selectedService = useMemo(() => services.find(s => s.id === selectedServiceId) || null, [services, selectedServiceId]);

  // Frequency + Inputs + Answers
  const [frequency, setFrequency] = useState<FrequencyKey>("monthly");
  const [area, setArea] = useState<number>(50);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [applyRUT, setApplyRUT] = useState<boolean>(true);
  const [coupon, setCoupon] = useState<string>("");

  // Quote
  const [quote, setQuote] = useState<QuoteResponse | undefined>();
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  // Booking
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", street: "", city: "", postal_code: "" });
  const [booking, setBooking] = useState<BookingResponse | undefined>();
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingIdem, setBookingIdem] = useState<string>(genIdemKey("book"));

  // Step control
  const [step, setStep] = useState<number>(1); // 1=ZIP, 2=Service, 3=Details, 4=Customer

  // Load services when ZIP accepted (or when tenant changes)
  useEffect(() => {
    if (!zipOk) return;
    setLoadingServices(true); setSvcError(null);
    fetchJson<PublicServicesResponse>("/api/public/services", tenantId)
      .then(data => setServices(data.items || []))
      .catch(e => setSvcError(e.message || String(e)))
      .finally(() => setLoadingServices(false));
  }, [zipOk, tenantId]);

  // Collect frequency options from config (standard + custom)
  const freqOpts = useMemo(() => {
    const base: { key: FrequencyKey; label: string }[] = [
      { key: "one_time", label: "One-time" },
      { key: "weekly", label: "Weekly" },
      { key: "biweekly", label: "Biweekly" },
      { key: "monthly", label: "Monthly" },
    ];
    if (!selectedService) return base;
    const cfg = selectedService.config;
    const custom = (cfg.frequencyOptions || []).map(f => ({ key: f.key as FrequencyKey, label: f.label }));
    // Deduplicate keys; prefer custom labels if duplicate
    const map = new Map<string, { key: FrequencyKey; label: string }>();
    for (const o of [...base, ...custom]) map.set(o.key, o);
    return Array.from(map.values());
  }, [selectedService]);

  // Answers helpers
  function updateAnswer(key: string, value: unknown) {
    setAnswers(prev => ({ ...prev, [key]: value }));
  }

  // Quote action
  async function onQuote() {
    if (!selectedService) { setQuote(undefined); setQuoteError("Select a service first"); return; }
    setQuoteError(null); setQuoting(true); setBooking(undefined);
    const body: QuoteBody = {
      tenant: { currency: "SEK", vat_rate: selectedService.config.vatRate ?? 25, rut_enabled: true },
      service_id: selectedService.id,
      frequency,
      inputs: { area },
      answers,
      applyRUT,
      ...(coupon.trim() ? { coupon: { code: coupon.trim(), type: "percent", value: 10 } } : {}) // sample shape; engine validates
    };
    try {
      const q = await fetchJson<QuoteResponse>("/api/public/quote", tenantId, { method: "POST", body: JSON.stringify(body) });
      setQuote(q);
    } catch (e: unknown) {
      setQuote(undefined);
      setQuoteError((e as Error)?.message || String(e));
    } finally { setQuoting(false); }
  }

  // Book action
  async function onBook() {
    if (!selectedService) { setBookingError("Select a service first"); return; }
    if (!quote) { setBookingError("Get a quote first"); return; }
    setBookingError(null);
    const body: BookingBody = {
      service_id: selectedService.id,
      frequency,
      inputs: { area },
      answers,
      customer: {
        name: customer.name.trim(),
        email: customer.email.trim(),
        phone: customer.phone.trim(),
        address: { street: customer.street.trim(), city: customer.city.trim(), postal_code: customer.postal_code.trim() },
      }
    };
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "x-tenant-id": tenantId, "Content-Type": "application/json", "Idempotency-Key": bookingIdem },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: BookingResponse = await res.json();
      setBooking(data);
    } catch (e: unknown) {
      setBooking(undefined);
      setBookingError((e as Error)?.message || String(e));
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-bold mb-2">CLE Widget · Stepper v2</h1>
      <p className="text-sm text-gray-600 mb-6">Tenant-aware, server-priced, idempotent booking</p>

      <Section title="Settings">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Tenant ID (x-tenant-id)">
            <input className="border rounded-lg p-2" value={tenantId} onChange={e => setTenantId(e.target.value)} title="Tenant ID" />
          </Field>
          <Field label="Apply RUT">
            <select className="border rounded-lg p-2" value={applyRUT ? "yes" : "no"} onChange={e => setApplyRUT(e.target.value === "yes") } title="Apply RUT">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Coupon (optional; demo)">
            <input className="border rounded-lg p-2" value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="SAVE10" title="Coupon code" />
          </Field>
      </div>
      </Section>

      {/* Step 1: ZIP */}
      <Section title="Step 1 · ZIP code">
        <div className="flex items-end gap-3">
          <Field label="ZIP (#####)">
            <input className="border rounded-lg p-2 w-40" value={zip} onChange={e => setZip(e.target.value)} placeholder="12345" title="ZIP code" />
          </Field>
          <button
            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
            disabled={!validateZip(zip)}
            onClick={() => { setZipOk(true); setStep(2); }}
          >Continue</button>
          <div className="text-sm ml-2">{zip && (validateZip(zip) ? "✓ looks good" : "✕ invalid")}</div>
      </div>
      </Section>

      {/* Step 2: Service */}
      <Section title="Step 2 · Select a service">
        {loadingServices && <div className="text-sm">Loading services…</div>}
        {svcError && <pre className="text-red-600 text-xs whitespace-pre-wrap">{svcError}</pre>}
        {!loadingServices && !svcError && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {services.map(s => (
                <button key={s.id}
                  className={`border rounded-xl p-3 text-left hover:shadow ${selectedServiceId===s.id?"ring-2 ring-black":""}`}
                  onClick={() => { setSelectedServiceId(s.id); setStep(3); }}>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-gray-600">model: {s.model}</div>
                </button>
              ))}
            </div>
            {!services.length && <div className="text-sm text-gray-600">No services found for tenant.</div>}
          </div>
        )}
      </Section>

      {/* Step 3: Details (frequency, inputs, dynamic questions) */}
      <Section title="Step 3 · Details">
        {!selectedService && <div className="text-sm">Select a service first.</div>}
        {selectedService && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Frequency">
                <select className="border rounded-lg p-2" value={frequency} onChange={e => setFrequency(e.target.value)} title="Frequency">
                  {freqOpts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Area (sqm)">
                <input type="number" min={0} className="border rounded-lg p-2" value={area} onChange={e => setArea(Number(e.target.value||0))} title="Area in square meters" />
              </Field>
              <div className="flex items-end">
                <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={onQuote} disabled={quoting}>Get Quote</button>
              </div>
            </div>

            {/* Dynamic Questions */}
            {(selectedService.config.dynamicQuestions?.length ?? 0) > 0 && (
              <div>
                <div className="font-medium mb-2">Questions</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedService.config.dynamicQuestions!.map(q => (
                    <div key={q.key} className="border rounded-xl p-3">
                      <div className="text-sm font-medium mb-2">{q.label}</div>
                      {q.type === "checkbox" && (
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={!!answers[q.key]} onChange={e => updateAnswer(q.key, e.target.checked)} />
                          <span>Yes</span>
                        </label>
                      )}
                      {q.type === "radio" && (
            <div className="space-y-1">
                          {(q as DynRadio).options?.map(opt => (
                            <label key={opt.value} className="flex items-center gap-2 text-sm">
                              <input type="radio" name={q.key} checked={answers[q.key]===opt.value} onChange={() => updateAnswer(q.key, opt.value)} />
                              <span>{opt.label}</span>
                  </label>
                ))}
              </div>
                      )}
                      {q.type === "checkbox_multi" && (
                        <div className="space-y-1">
                          {(q as DynCheckboxMulti).options?.map(opt => {
                            const arr: string[] = Array.isArray(answers[q.key]) ? answers[q.key] : [];
                            const on = arr.includes(opt.value);
                            return (
                              <label key={opt.value} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={on} onChange={e => {
                                  const next = new Set(arr);
                                  if (e.target.checked) next.add(opt.value); else next.delete(opt.value);
                                  updateAnswer(q.key, Array.from(next));
                                }} />
                                <span>{opt.label}</span>
                              </label>
                            );
                          })}
            </div>
          )}
                      {q.type === "text" && (
                        <input className="border rounded-lg p-2 w-full" value={answers[q.key] ?? ""} onChange={e => updateAnswer(q.key, e.target.value)} title={q.label} />
                      )}
                    </div>
                  ))}
                </div>
          </div>
            )}

            {quoteError && <pre className="text-xs text-red-600 whitespace-pre-wrap">{quoteError}</pre>}
          {quote && (
              <div className="border rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">Quote</div>
                  <div className="text-sm">{invariantText(quote)}</div>
                </div>
                <div className="text-sm text-gray-700 mb-2">model: {quote.model}</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-1">Line</th>
                      <th className="py-1">RUT?</th>
                      <th className="py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.lines.map(l => (
                      <tr key={l.key} className="border-t">
                        <td className="py-1">{l.label}</td>
                        <td className="py-1">{l.rutEligible ? "Yes" : "No"}</td>
                        <td className="py-1 text-right">{currencyMinorToMajor(l.amount_minor, quote.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 text-right space-y-1 text-sm">
                  <div>Subtotal ex-VAT: <strong>{currencyMinorToMajor(quote.subtotal_ex_vat_minor ?? quote.subtotal_minor ?? 0, quote.currency)}</strong></div>
                  <div>VAT: <strong>{currencyMinorToMajor(quote.vat_minor, quote.currency)}</strong></div>
                  <div>RUT: <strong>{currencyMinorToMajor(quote.rut_minor, quote.currency)}</strong></div>
                  {quote.discount_minor !== 0 && (<div>Discount: <strong>{currencyMinorToMajor(quote.discount_minor, quote.currency)}</strong></div>)}
                  <div className="text-base">Total: <strong>{currencyMinorToMajor(quote.total_minor, quote.currency)}</strong></div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={() => setStep(4)}>Continue</button>
                  <button className="px-4 py-2 rounded-xl bg-gray-100" onClick={() => setBookingIdem(genIdemKey("book"))}>New Idempotency Key</button>
                  <div className="text-xs text-gray-500 self-center">Key: {bookingIdem}</div>
                </div>
            </div>
          )}
        </div>
      )}
      </Section>

      {/* Step 4: Customer + Book */}
      <Section title="Step 4 · Customer">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Name"><input className="border rounded-lg p-2" value={customer.name} onChange={e => setCustomer(v => ({...v, name: e.target.value}))} title="Customer name" /></Field>
          <Field label="Email"><input className="border rounded-lg p-2" value={customer.email} onChange={e => setCustomer(v => ({...v, email: e.target.value}))} title="Customer email" /></Field>
          <Field label="Phone"><input className="border rounded-lg p-2" value={customer.phone} onChange={e => setCustomer(v => ({...v, phone: e.target.value}))} title="Customer phone" /></Field>
          <Field label="Street"><input className="border rounded-lg p-2" value={customer.street} onChange={e => setCustomer(v => ({...v, street: e.target.value}))} title="Street address" /></Field>
          <Field label="City"><input className="border rounded-lg p-2" value={customer.city} onChange={e => setCustomer(v => ({...v, city: e.target.value}))} title="City" /></Field>
          <Field label="Postal Code"><input className="border rounded-lg p-2" value={customer.postal_code} onChange={e => setCustomer(v => ({...v, postal_code: e.target.value}))} title="Postal code" /></Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50" disabled={!quote} onClick={onBook}>Book</button>
          {booking && <div className="text-sm">Created: <span className="font-mono">{booking.id}</span> · status <b>{booking.status}</b></div>}
    </div>
        {bookingError && <pre className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{bookingError}</pre>}
      </Section>

      <div className="text-xs text-gray-500 mt-8">Step: {step} · Tenant: {tenantId}</div>
    </main>
  );
}