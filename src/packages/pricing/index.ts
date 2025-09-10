import { QuoteRequest, QuoteBreakdown, LineItem, AddonConfig, ServiceConfigV1 } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

function applyFrequency(base: number, freq: QuoteRequest["frequency"], cfg: ServiceConfigV1): number {
  const mult = cfg.frequency_multipliers?.[freq] ?? 1;
  return base * mult;
}

function computeAddons(addonsCfg: AddonConfig[], selections: QuoteRequest["addons"]): LineItem[] {
  const lines: LineItem[] = [];
  for (const sel of selections) {
    const cfg = addonsCfg.find(a => a.key === sel.key);
    if (!cfg) continue;
    if (cfg.type === "fixed") {
      lines.push({ kind: "addon", code: `ADDON:${cfg.key}`, label: cfg.name, total: round2(cfg.amount) });
    } else {
      const qty = sel.quantity ?? 1;
      const total = round2(cfg.amount * qty);
      lines.push({ kind: "addon", code: `ADDON:${cfg.key}`, label: cfg.name, quantity: qty, unitPrice: cfg.amount, total });
    }
  }
  return lines;
}

function model_per_sqm(inputs: Record<string, number>, cfg: ServiceConfigV1): { base: LineItem } {
  const sqm = inputs["sqm"] ?? 0;
  let total = 0;
  if (cfg.tiers && cfg.tiers.length) {
    let consumed = 0;
    for (const t of cfg.tiers) {
      const remaining = Math.max(0, sqm - consumed);
      if (remaining === 0) break;
      const span = t.up_to == null ? remaining : Math.max(0, Math.min(remaining, t.up_to - consumed));
      total += span * t.rate;
      consumed += span;
    }
  } else if (cfg.base_per_sqm != null) {
    total = sqm * cfg.base_per_sqm;
  } else {
    throw new Error("per_sqm config missing rates");
  }
  return { base: { kind: "base", code: "BASE", label: `Area pricing (${sqm} m²)`, quantity: sqm, unitPrice: total / (sqm || 1), total: round2(total) } };
}

function model_hourly(inputs: Record<string, number>, cfg: ServiceConfigV1): { base: LineItem } {
  const hours = inputs["hours"] ?? 0;
  if (cfg.hourly_rate == null) throw new Error("hourly config missing hourly_rate");
  const total = round2(hours * cfg.hourly_rate);
  return { base: { kind: "base", code: "BASE", label: `Hourly (${hours} h)`, quantity: hours, unitPrice: cfg.hourly_rate, total } };
}

function model_fixed(_inputs: Record<string, number>, cfg: ServiceConfigV1): { base: LineItem } {
  if (cfg.fixed_amount == null) throw new Error("fixed config missing fixed_amount");
  return { base: { kind: "base", code: "BASE", label: "Fixed price", total: round2(cfg.fixed_amount) } };
}

export function computeQuote(params: {
  req: QuoteRequest;
  tenant: { currency: string; vat_rate: number; rut_enabled: boolean };
  service: { model: QuoteBreakdown["meta"]["model"]; schemaVersion: number; config: ServiceConfigV1; name: string };
}): QuoteBreakdown {
  const { req, tenant, service } = params;

  let baseLine: LineItem;
  if (service.model === "per_sqm") baseLine = model_per_sqm(req.inputs, service.config).base;
  else if (service.model === "hourly") baseLine = model_hourly(req.inputs, service.config).base;
  else if (service.model === "fixed") baseLine = model_fixed(req.inputs, service.config).base;
  else throw Object.assign(new Error(`Model ${service.model} not implemented`), { status: 501 });

  const lines: LineItem[] = [baseLine];

  const baseAfterFreq = round2(applyFrequency(baseLine.total, req.frequency, service.config));
  const freqDiff = round2(baseAfterFreq - baseLine.total);
  if (freqDiff !== 0) lines.push({ kind: "discount", code: `FREQ:${req.frequency}`, label: `Frequency (${req.frequency})`, total: freqDiff });

  let subtotal = baseAfterFreq;
  const minPrice = service.config.min_price ?? 0;
  if (minPrice > 0 && subtotal < minPrice) {
    const bump = round2(minPrice - subtotal);
    subtotal = minPrice;
    lines.push({ kind: "fee", code: "MIN_PRICE", label: "Minimum price adjustment", total: bump });
  }

  const addonLines = computeAddons(service.config.addons ?? [], req.addons);
  for (const l of addonLines) subtotal = round2(subtotal + l.total);
  lines.push(...addonLines);

  const vatRate = tenant.vat_rate;
  const vatAmount = round2(subtotal * (vatRate / 100));
  lines.push({ kind: "vat", code: `VAT:${vatRate}`, label: `VAT ${vatRate}%`, total: vatAmount });

  let rutAmount = 0;
  if (req.applyRUT && tenant.rut_enabled && service.config.rut?.enabled) {
    const laborRatio = Math.max(0, Math.min(1, service.config.rut.labor_ratio));
    const laborExVat = round2(subtotal * laborRatio);
    const laborVat = round2(laborExVat * (vatRate / 100));
    rutAmount = round2(-(laborExVat + laborVat) * 0.5);
    lines.push({ kind: "rut", code: "RUT", label: "RUT deduction (estimated)", total: rutAmount });
  }

  const total = round2(subtotal + vatAmount + rutAmount);

  return {
    currency: tenant.currency,
    subtotalExVat: subtotal,
    vatAmount,
    rutAmount,
    total,
    lines,
    meta: {
      model: service.model,
      frequency: req.frequency,
      idempotencyKey: req.idempotencyKey,
      schemaVersion: service.schemaVersion
    }
  };
}
