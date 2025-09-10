import { z } from "zod";

export const Frequency = z.enum(["one_time","monthly","biweekly","weekly"]);
export type Frequency = z.infer<typeof Frequency>;

export const AddonSelection = z.object({
  key: z.string().min(1),
  quantity: z.number().int().positive().optional()
});
export type AddonSelection = z.infer<typeof AddonSelection>;

export const QuoteRequestSchema = z.object({
  tenantId: z.string().length(36).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  serviceKey: z.string().min(1),
  locale: z.enum(["sv-SE","en-US"]).default("sv-SE"),
  frequency: Frequency,
  inputs: z.record(z.string(), z.number().nonnegative()),
  addons: z.array(AddonSelection).default([]),
  applyRUT: z.boolean().default(false),
  idempotencyKey: z.string().max(128).optional()
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export type Money = number;

export type LineKind = "base"|"addon"|"fee"|"discount"|"vat"|"rut";
export interface LineItem {
  kind: LineKind;
  code: string;
  label: string;
  quantity?: number;
  unitPrice?: Money;
  total: Money; // signed
}

export interface QuoteBreakdown {
  currency: string;
  subtotalExVat: Money;
  vatAmount: Money;
  rutAmount: Money; // negative or 0
  total: Money;     // subtotalExVat + vatAmount + rutAmount
  lines: LineItem[];
  meta: {
    model: "fixed"|"hourly"|"per_sqm"|"per_room"|"windows";
    frequency: Frequency;
    idempotencyKey?: string;
    schemaVersion: number;
  };
}

export type Tier = { up_to: number | null; rate: number };
export type AddonConfig =
  | { key: string; name: string; type: "fixed"; amount: number }
  | { key: string; name: string; type: "per_unit"; amount: number };

export interface ServiceConfigV1 {
  min_price?: number;
  base_per_sqm?: number;
  hourly_rate?: number;
  fixed_amount?: number;
  tiers?: Tier[];
  addons?: AddonConfig[];
  frequency_multipliers?: Record<Frequency, number>;
  rut?: { enabled: boolean; labor_ratio: number };
}
