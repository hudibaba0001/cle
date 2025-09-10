import { z } from "zod";

export const PricingModel = z.enum(["fixed","hourly","per_sqm","per_room","windows"]);
export type PricingModel = z.infer<typeof PricingModel>;

export const AddonSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.enum(["fixed","per_unit"]).default("fixed"),
  amount: z.number().nonnegative(),
});
export type Addon = z.infer<typeof AddonSchema>;

export const FrequencyKey = z.enum(["one_time","monthly","biweekly","weekly"]);
export type FrequencyKey = z.infer<typeof FrequencyKey>;

export const FrequencyMapSchema = z.record(z.string(), z.number().positive());
export type FrequencyMap = z.infer<typeof FrequencyMapSchema>;

export const ServiceConfigBase = z.object({
  model: PricingModel,
  name: z.string().optional(),
  minPrice: z.number().nonnegative().optional(),
  addons: z.array(AddonSchema).optional(),
  frequencyMultipliers: FrequencyMapSchema.optional(),
  rutEligible: z.boolean().optional(),
  vatRate: z.number().min(0).max(100).default(25),
});
export type ServiceConfigBase = z.infer<typeof ServiceConfigBase>;

export const FixedConfig = ServiceConfigBase.extend({
  model: z.literal("fixed"),
  fixedPrice: z.number().nonnegative(),
});

export const HourlyConfig = ServiceConfigBase.extend({
  model: z.literal("hourly"),
  hourlyRate: z.number().nonnegative(),
  minimumHours: z.number().nonnegative().optional(),
});

export const PerSqmConfig = ServiceConfigBase.extend({
  model: z.literal("per_sqm"),
  pricePerSqm: z.number().nonnegative(),
});

export const PerRoomConfig = ServiceConfigBase.extend({
  model: z.literal("per_room"),
  roomTypes: z.array(z.object({
    key: z.string(),
    name: z.string(),
    pricePerRoom: z.number().nonnegative(),
    rutEligible: z.boolean().optional(),
  })).min(1),
});

export const WindowsConfig = ServiceConfigBase.extend({
  model: z.literal("windows"),
  windowTypes: z.array(z.object({
    key: z.string(),
    name: z.string(),
    pricePerUnit: z.number().nonnegative(),
  })).min(1),
});

export const ServiceConfig = z.discriminatedUnion("model", [
  FixedConfig, HourlyConfig, PerSqmConfig, PerRoomConfig, WindowsConfig
]);
export type ServiceConfig = z.infer<typeof ServiceConfig>;

export const QuoteInputs = z.object({
  area: z.number().nonnegative().optional(),
  hours: z.number().nonnegative().optional(),
  rooms: z.record(z.string(), z.number().int().nonnegative()).optional(),
  windows: z.record(z.string(), z.number().int().nonnegative()).optional(),
});
export type QuoteInputs = z.infer<typeof QuoteInputs>;

export const QuoteAddonInput = z.object({
  key: z.string(),
  quantity: z.number().int().positive().optional(),
});
export type QuoteAddonInput = z.infer<typeof QuoteAddonInput>;

export const CouponSchema = z.object({
  code: z.string(),
  type: z.enum(["percent","fixed"]),
  value: z.number().positive(),
});
export type Coupon = z.infer<typeof CouponSchema>;

export const QuoteRequestSchema = z.object({
  tenant: z.object({
    currency: z.string().default("SEK"),
    vat_rate: z.number().min(0).max(100).default(25),
    rut_enabled: z.boolean().default(false),
  }),
  service: ServiceConfig,
  frequency: FrequencyKey.default("one_time"),
  inputs: QuoteInputs.default({}),
  addons: z.array(QuoteAddonInput).default([]),
  applyRUT: z.boolean().default(false),
  coupon: CouponSchema.optional(),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteLine = z.object({
  key: z.string(),
  label: z.string(),
  amount_minor: z.number().int(),
});
export type QuoteLine = z.infer<typeof QuoteLine>;

export const QuoteBreakdown = z.object({
  currency: z.string(),
  model: PricingModel,
  lines: z.array(QuoteLine),
  subtotal_ex_vat_minor: z.number().int(),
  vat_minor: z.number().int(),
  rut_minor: z.number().int(),
  discount_minor: z.number().int(),
  total_minor: z.number().int(),
});
export type QuoteBreakdown = z.infer<typeof QuoteBreakdown>;
