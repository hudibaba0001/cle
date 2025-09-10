import { QuoteRequest, QuoteRequestSchema, QuoteBreakdown, QuoteLine, ServiceConfig, ModifierRule } from "./types";

const toMinor = (n:number)=>Math.round(n*100);
const fromMinor = (m:number)=>m/100;
const clampMinor = (m:number)=>Math.max(0, Math.round(m));
const pct = (v:number)=>Math.max(0, Math.min(100, v));

function applyFrequency(base:number, fm:Record<string,number>|undefined, fkey:string){ return (fm?.[fkey] ?? 1) * base; }

// PDF-compliant base calculators (pre-frequency)
function baseForModel(svc: ServiceConfig, inputs: QuoteRequest["inputs"]): number {
  switch (svc.model) {
    case "fixed_tier": {
      const a = Math.max(0, inputs.area ?? 0);
      const t = svc.tiers.find(t => a >= t.min && a <= t.max);
      return t ? t.price : 0;
    }
    case "tiered_multiplier": {
      const a = Math.max(0, inputs.area ?? 0);
      if (a === 0) return 0;
      const t = svc.tiers.find(t => a >= t.min && a <= t.max);
      const raw = t ? a * t.ratePerSqm : 0;
      return Math.max(raw, svc.minimum ?? 0);
    }
    case "universal_multiplier": {
      const a = Math.max(0, inputs.area ?? 0);
      if (a === 0) return 0;
      const raw = a * svc.ratePerSqm;
      return Math.max(raw, svc.minimum ?? 0);
    }
    case "windows": {
      const w = inputs.windows ?? {};
      let raw = 0;
      for (const t of svc.windowTypes) raw += (w[t.key] ?? 0) * t.pricePerUnit;
      return Math.max(raw, raw>0 ? (svc.minimum ?? 0) : 0);
    }
    case "hourly_area": {
      const a = Math.max(0, inputs.area ?? 0);
      const t = svc.areaToHours.find(t => a >= t.min && a <= t.max);
      const hours = t ? t.hours : 0;
      const raw = hours * svc.hourlyRate;
      return Math.max(raw, raw>0 ? (svc.minimum ?? 0) : 0);
    }
    case "per_room": {
      const r = inputs.rooms ?? {};
      let raw = 0;
      for (const t of svc.roomTypes) raw += (r[t.key] ?? 0) * t.pricePerRoom;
      return Math.max(raw, raw>0 ? (svc.minimum ?? 0) : 0);
    }
  }
}

function addonLines(svc: ServiceConfig, inAddons: QuoteRequest["addons"]): QuoteLine[] {
  const lines: QuoteLine[] = [];
  for (const a of inAddons) {
    const def = svc.addons.find(d => d.key === a.key);
    if (!def) continue;
    const qty = def.type === "per_unit" ? (a.quantity ?? 1) : 1;
    const amt = def.amount * qty;
    if (amt === 0) continue;
    lines.push({ key:`addon:${def.key}`, label:def.name, rutEligible:def.rutEligible, amount_minor: toMinor(amt) });
  }
  return lines;
}

function feeLines(svc: ServiceConfig): QuoteLine[] {
  return (svc.fees ?? []).filter(f => f.amount>0).map(f => ({ key:`fee:${f.key}`, label:f.name, rutEligible:f.rutEligible, amount_minor: toMinor(f.amount) }));
}

function modifierLines(svc: ServiceConfig, answers: Record<string, unknown>, ctx:{ baseAfterFreq:number; subtotalBeforeMods:number }): QuoteLine[] {
  const rules = (svc.modifiers ?? []) as ModifierRule[];
  const out: QuoteLine[] = [];
  for (const m of rules) {
    if (m.condition.type !== "boolean") continue;
    const ans = Boolean((answers as Record<string, unknown>)[m.condition.answerKey]);
    if (ans !== (m.condition.when ?? true)) continue;
    const target = m.effect.target === "base_after_frequency" ? ctx.baseAfterFreq : ctx.subtotalBeforeMods;
    let delta = m.effect.mode === "percent" ? target * (pct(m.effect.value)/100) : m.effect.value;
    if (m.effect.direction === "decrease") delta = -delta;
    if (!delta) continue;
    out.push({ key:`modifier:${m.key}`, label:m.effect.label || m.label, rutEligible:m.effect.rutEligible, amount_minor: toMinor(delta) });
  }
  return out;
}

export function computeQuoteV2(req: unknown): QuoteBreakdown {
  const parsed = QuoteRequestSchema.parse(req);
  const { tenant, service, inputs, addons, frequency, applyRUT, coupon, answers } = parsed;

  // Base → frequency
  const baseRaw = baseForModel(service, inputs);
  const baseAfterFreq = applyFrequency(baseRaw, service.frequencyMultipliers, frequency);
  const baseLine: QuoteLine = { key:"base", label:"Base (after frequency)", rutEligible: service.rutEligible ?? true, amount_minor: toMinor(baseAfterFreq) };

  const addLines = addonLines(service, addons);
  const fLines = feeLines(service);
  const subtotalBeforeMods_minor = baseLine.amount_minor + addLines.reduce((s,l)=>s+l.amount_minor,0) + fLines.reduce((s,l)=>s+l.amount_minor,0);
  const modLines = modifierLines(service, answers ?? {}, { baseAfterFreq: fromMinor(baseLine.amount_minor), subtotalBeforeMods: fromMinor(subtotalBeforeMods_minor) });

  const subtotal_ex_vat_minor = subtotalBeforeMods_minor + modLines.reduce((s,l)=>s+l.amount_minor,0);
  const vat_minor = Math.round(subtotal_ex_vat_minor * ((service.vatRate ?? tenant.vat_rate ?? 25)/100));

  // Per-line RUT, 50% of eligible ex-VAT lines
  let rut_candidate_minor = 0;
  if (tenant.rut_enabled && applyRUT) {
    const elig = [baseLine, ...addLines, ...fLines, ...modLines].filter(l=>l.rutEligible);
    rut_candidate_minor = elig.reduce((s,l)=>s+l.amount_minor,0);
  }
  const rut_minor = rut_candidate_minor > 0 ? -Math.round(rut_candidate_minor * 0.5) : 0;

  const preDiscount_minor = subtotal_ex_vat_minor + vat_minor + rut_minor;
  let discount_minor = 0;
  if (coupon) {
    if (coupon.type === "percent") discount_minor = -Math.round(preDiscount_minor * (pct(coupon.value)/100));
    else discount_minor = -toMinor(coupon.value);
    if (Math.abs(discount_minor) > preDiscount_minor) discount_minor = -preDiscount_minor;
  }
  const total_minor = clampMinor(preDiscount_minor + discount_minor);

  const lines: QuoteLine[] = [ baseLine, ...addLines, ...fLines, ...modLines, { key:"vat", label:"VAT", rutEligible:false, amount_minor: vat_minor } ];
  if (rut_minor) lines.push({ key:"rut", label:"RUT deduction", rutEligible:false, amount_minor: rut_minor });
  if (discount_minor) lines.push({ key:"discount", label:"Discount", rutEligible:false, amount_minor: discount_minor });

  return { currency: tenant.currency ?? "SEK", model: service.model, lines, subtotal_ex_vat_minor, vat_minor, rut_minor, discount_minor, total_minor };
}
