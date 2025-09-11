import { z } from "zod";

export const FrequencyMultipliersSchema = z.object({
  one_time: z.number().min(0),
  weekly: z.number().min(0),
  biweekly: z.number().min(0),
  monthly: z.number().min(0),
});

const ModifierEffectSchema = z.object({
  target: z.enum(["base_after_frequency", "subtotal_before_modifiers"]),
  // Align with pricing-v2 engine ("fixed" not "absolute")
  mode: z.enum(["percent", "fixed"]),
  value: z.number(),
  direction: z.enum(["increase", "decrease"]),
  rutEligible: z.boolean().default(false),
  label: z.string().min(1),
});

const ModifierConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("boolean"), when: z.boolean(), answerKey: z.string().min(1) }),
]);

const ModifierSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  condition: ModifierConditionSchema,
  effect: ModifierEffectSchema,
});

const FeeSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  amount: z.number(),
  rutEligible: z.boolean().default(false),
});

export const ServiceConfigSchema = z.object({
  model: z.enum([
    "fixed_tier",
    "tiered_multiplier",
    "universal_multiplier",
    "windows",
    "hourly_area",
    "per_room",
  ]),
  name: z.string().min(1),
  frequencyMultipliers: FrequencyMultipliersSchema,
  vatRate: z.number().int().min(0),
  rutEligible: z.boolean(),
  addons: z.array(z.any()).default([]),
  fees: z.array(FeeSchema).default([]),
  modifiers: z.array(ModifierSchema).default([]),
  minimum: z.number().min(0).default(0),
  ratePerSqm: z.number().optional(),
});

export const CreateServiceSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]{3,}$/).optional(),
  active: z.boolean().default(true),
  config: ServiceConfigSchema,
});
export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;
