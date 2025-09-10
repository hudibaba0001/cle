import { QuoteBreakdown, QuoteLine, QuoteRequest, QuoteRequestSchema, ServiceConfig } from "./types";

function toMinor(amount: number): number { return Math.round(amount * 100); }
function clampMinor(n: number) { return Math.max(0, Math.round(n)); }

function applyFrequency(base: number, freqMap: Record<string, number> | undefined, key: string): number {
  return (freqMap?.[key] ?? 1) * base;
}

function computeBase(service: ServiceConfig, inputs: QuoteRequest["inputs"]): { base: number; detail?: Record<string, unknown> } {
  switch (service.model) {
    case "fixed":
      return { base: service.fixedPrice };
    case "hourly": {
      const hrs = Math.max(0, inputs.hours ?? 0);
      const min = Math.max(0, service.minimumHours ?? 0);
      const billable = Math.max(hrs, min);
      return { base: billable * service.hourlyRate, detail: { hours: billable, rate: service.hourlyRate } };
    }
    case "per_sqm": {
      const sqm = Math.max(0, inputs.area ?? 0);
      return { base: sqm * service.pricePerSqm, detail: { sqm, rate: service.pricePerSqm } };
    }
    case "per_room": {
      const rooms = inputs.rooms ?? {};
      let sum = 0;
      for (const rt of service.roomTypes) sum += Math.max(0, rooms[rt.key] ?? 0) * rt.pricePerRoom;
      return { base: sum };
    }
    case "windows": {
      const counts = inputs.windows ?? {};
      let sum = 0;
      for (const wt of service.windowTypes) sum += Math.max(0, counts[wt.key] ?? 0) * wt.pricePerUnit;
      return { base: sum };
    }
  }
}

function computeAddons(service: ServiceConfig, addonsIn: QuoteRequest["addons"]): number {
  if (!service.addons?.length) return 0;
  let total = 0;
  for (const a of addonsIn) {
    const def = service.addons.find(x => x.key === a.key);
    if (!def) continue;
    total += def.type === "per_unit" ? (a.quantity ?? 1) * def.amount : def.amount;
  }
  return total;
}

export function computeQuoteV2(req: unknown): QuoteBreakdown {
  const parsed = QuoteRequestSchema.parse(req);
  const { tenant, service, inputs, addons, frequency, applyRUT, coupon } = parsed;

  // Base
  const baseRes = computeBase(service, inputs);
  let base = baseRes.base;

  // Frequency on base only
  base = applyFrequency(base, service.frequencyMultipliers, frequency);

  // Min price guard (only if some base was selected)
  if (service.minPrice && base > 0 && base < service.minPrice) base = service.minPrice;

  // Add-ons (not multiplied)
  const addonsTotal = computeAddons(service, addons);

  // Subtotal ex VAT
  const subtotal = base + addonsTotal;

  // VAT
  const vatRate = (service.vatRate ?? tenant.vat_rate ?? 25) / 100;
  const vat = subtotal * vatRate;

  // RUT (30% of subtotal+VAT) when allowed and user opted-in
  const rutEligible = tenant.rut_enabled && (service.rutEligible ?? true) && applyRUT;
  const rut = rutEligible ? 0.30 * (subtotal + vat) : 0;

  // Total before coupon
  const preDiscountTotal = subtotal + vat - rut;

  // Coupon (post-VAT/RUT)
  let discount = 0;
  if (coupon) {
    if (coupon.type === "percent") {
      const pct = Math.max(0, Math.min(100, coupon.value));
      discount = preDiscountTotal * (pct / 100);
    } else {
      discount = coupon.value;
    }
    if (discount > preDiscountTotal) discount = preDiscountTotal;
  }

  const total = preDiscountTotal - discount;

  // Lines
  const lines: QuoteLine[] = [{ key: "base", label: "Base", amount_minor: toMinor(base) }];
  if (addonsTotal > 0) lines.push({ key: "addons", label: "Add-ons", amount_minor: toMinor(addonsTotal) });
  lines.push({ key: "vat", label: "VAT", amount_minor: toMinor(vat) });
  if (rutEligible) lines.push({ key: "rut", label: "RUT deduction", amount_minor: -toMinor(rut) });
  if (discount > 0) lines.push({ key: "discount", label: "Discount", amount_minor: -toMinor(discount) });

  return {
    currency: tenant.currency ?? "SEK",
    model: service.model,
    lines,
    subtotal_ex_vat_minor: toMinor(subtotal),
    vat_minor: toMinor(vat),
    rut_minor: -toMinor(rut),
    discount_minor: -toMinor(discount),
    total_minor: clampMinor(toMinor(total)),
  };
}
