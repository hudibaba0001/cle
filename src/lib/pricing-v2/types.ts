import { z } from "zod";

/** Frequency surcharges (PDF: weekly 1.00, biweekly 1.15, monthly 1.40) */
export const FrequencyKey = z.enum(["one_time","weekly","biweekly","monthly"]);
export type FrequencyKey = z.infer<typeof FrequencyKey>;

export const FrequencyMapSchema = z.object({
  one_time: z.number().positive().default(1.0),
  weekly: z.number().positive().default(1.0),
  biweekly: z.number().positive().default(1.15),
  monthly: z.number().positive().default(1.40),
});

export const AddonSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["fixed","per_unit"]).default("fixed"),
  amount: z.number().nonnegative(),
  rutEligible: z.boolean().default(false),
});
export type Addon = z.infer<typeof AddonSchema>;

export const FeeSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  rutEligible: z.boolean().default(false),
});
export type Fee = z.infer<typeof FeeSchema>;

/** Dynamic pricing: boolean → ±% or ±fixed, applies to base-after-frequency or subtotal-before-mods */
export const ModifierRule = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  condition: z.object({
    type: z.literal("boolean"),
    when: z.boolean().default(true),
    answerKey: z.string().min(1),
  }),
  effect: z.object({
    target: z.enum(["base_after_frequency","subtotal_before_modifiers"]).default("subtotal_before_modifiers"),
    mode: z.enum(["percent","fixed"]),
    value: z.number().positive(),
    direction: z.enum(["increase","decrease"]).default("increase"),
    rutEligible: z.boolean().default(false),
    label: z.string().optional(),
  }),
});
export type ModifierRule = z.infer<typeof ModifierRule>;

/** Model configs (PDF) */
const BaseCfg = z.object({
  name: z.string().optional(),
  frequencyMultipliers: FrequencyMapSchema.default({ one_time:1, weekly:1, biweekly:1.15, monthly:1.4 }),
  vatRate: z.number().min(0).max(100).default(25),
  rutEligible: z.boolean().default(true),
  addons: z.array(AddonSchema).default([]),
  fees: z.array(FeeSchema).default([]),
  modifiers: z.array(ModifierRule).default([]),
  minPrice: z.number().nonnegative().optional(),
});

export const FixedTierConfig = BaseCfg.extend({
  model: z.literal("fixed_tier"),
  tiers: z.array(z.object({
    min: z.number().nonnegative(),
    max: z.number().positive(),
    price: z.number().nonnegative(),
  })).min(1),
});

export const TieredMultiplierConfig = BaseCfg.extend({
  model: z.literal("tiered_multiplier"),
  tiers: z.array(z.object({
    min: z.number().nonnegative(),
    max: z.number().positive(),
    ratePerSqm: z.number().nonnegative(),
  })).min(1),
  minimum: z.number().nonnegative().default(0),
});

export const UniversalMultiplierConfig = BaseCfg.extend({
  model: z.literal("universal_multiplier"),
  ratePerSqm: z.number().nonnegative(),
  minimum: z.number().nonnegative().default(0),
});

export const WindowsConfig = BaseCfg.extend({
  model: z.literal("windows"),
  windowTypes: z.array(z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    pricePerUnit: z.number().nonnegative(),
  })).min(1),
  minimum: z.number().nonnegative().default(0),
});

export const HourlyAreaConfig = BaseCfg.extend({
  model: z.literal("hourly_area"),
  hourlyRate: z.number().nonnegative(),
  areaToHours: z.array(z.object({
    min: z.number().nonnegative(),
    max: z.number().positive(),
    hours: z.number().positive(),
  })).min(1),
  minimum: z.number().nonnegative().default(0),
});

export const PerRoomConfig = BaseCfg.extend({
  model: z.literal("per_room"),
  roomTypes: z.array(z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    pricePerRoom: z.number().nonnegative(),
  })).min(1),
  minimum: z.number().nonnegative().default(0),
});

export const ServiceConfig = z.discriminatedUnion("model", [
  FixedTierConfig, TieredMultiplierConfig, UniversalMultiplierConfig,
  WindowsConfig, HourlyAreaConfig, PerRoomConfig,
]);
export type ServiceConfig = z.infer<typeof ServiceConfig>;

export const QuoteInputs = z.object({
  area: z.number().nonnegative().optional(),
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
  // Accept arbitrary key; routes resolve to multiplier or return error
  frequency: z.string().optional(),
  inputs: QuoteInputs.default({}),
  addons: z.array(QuoteAddonInput).default([]),
  applyRUT: z.boolean().default(false),
  coupon: CouponSchema.optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteLine = z.object({
  key: z.string(),
  label: z.string(),
  rutEligible: z.boolean().default(false),
  amount_minor: z.number().int(),
});
export type QuoteLine = z.infer<typeof QuoteLine>;

export const QuoteBreakdown = z.object({
  currency: z.string(),
  model: z.string(),
  lines: z.array(QuoteLine),
  subtotal_ex_vat_minor: z.number().int(),
  vat_minor: z.number().int(),
  rut_minor: z.number().int(),
  discount_minor: z.number().int(),
  total_minor: z.number().int(),
});
export type QuoteBreakdown = z.infer<typeof QuoteBreakdown>;
