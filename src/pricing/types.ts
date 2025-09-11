import { z } from "zod";

export const FrequencyMultipliersSchema = z.object({
  one_time: z.number().positive(),
  weekly: z.number().positive(),
  biweekly: z.number().positive(),
  monthly: z.number().positive(),
});

const ModifierEffectSchema = z.object({
  target: z.enum(["base_after_frequency","subtotal_before_modifiers"]),
  mode: z.enum(["percent","fixed"]),
  value: z.number().nonnegative(),
  direction: z.enum(["increase","decrease"]),
  rutEligible: z.boolean().default(false),
  label: z.string().min(1),
});

const ModifierConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("boolean"), when: z.boolean(), answerKey: z.string().min(1) }),
]);

export const ModifierSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  condition: ModifierConditionSchema,
  effect: ModifierEffectSchema,
});

export const FeeSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  amount: z.number().nonnegative(), // major currency in config
  rutEligible: z.boolean().default(false),
});

export const FixedTierSchema = z.object({
  tiers: z.array(z.object({
    min: z.number().int().min(0),
    max: z.number().int().min(0),
    price: z.number().nonnegative(), // major
  })).nonempty(),
});

export const TieredRateSchema = z.object({
  rateTiers: z.array(z.object({
    min: z.number().int().min(0),
    max: z.number().int().min(0),
    ratePerSqm: z.number().nonnegative(), // major / m²
  })).nonempty(),
});

export const UniversalMultiplierSchema = z.object({
  ratePerSqm: z.number().nonnegative(),
  minArea: z.number().int().min(0).optional(),
  maxArea: z.number().int().min(0).optional(),
});

export const WindowsSchema = z.object({
  types: z.array(z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    pricePerUnit: z.number().nonnegative(), // major
  })).nonempty(),
});

export const PerRoomSchema = z.object({
  rooms: z.array(z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    pricePerUnit: z.number().nonnegative(), // major
  })).nonempty(),
});

export const ServiceConfigSchema = z.object({
  model: z.enum(["fixed_tier","tiered_multiplier","universal_multiplier","windows","hourly_area","per_room"]),
  name: z.string().min(1),
  frequencyMultipliers: FrequencyMultipliersSchema,
  vatRate: z.number().int().min(0),
  rutEligible: z.boolean(),
  addons: z.array(FeeSchema).default([]),
  fees: z.array(FeeSchema).default([]),
  modifiers: z.array(ModifierSchema).default([]),
  minimum: z.number().min(0).default(0),
  maximum: z.number().min(0).optional(),

  fixed_tier: FixedTierSchema.optional(),
  tiered_multiplier: TieredRateSchema.optional(),
  universal_multiplier: UniversalMultiplierSchema.optional(),
  windows: WindowsSchema.optional(),
  per_room: PerRoomSchema.optional(),

  hourly_area: z.object({
    hoursPerSqm: z.number().nonnegative(),
    ratePerHour: z.number().nonnegative(), // major
  }).optional(),
});
export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

export const QuoteRequestSchema = z.object({
  tenant: z.object({
    currency: z.string().min(1),
    vat_rate: z.number(),
    rut_enabled: z.boolean(),
  }),
  service: ServiceConfigSchema,
  frequency: z.enum(["one_time","weekly","biweekly","monthly"]),
  inputs: z.record(z.string(), z.unknown()).default({}),
  addons: z.array(z.any()).default([]),
  applyRUT: z.boolean().default(true),
  coupon: z
    .object({
      code: z.string(),
      type: z.enum(["percent","fixed"]),
      value: z.number().nonnegative(),
    })
    .optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;
