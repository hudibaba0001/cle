import { z } from "zod";
import { ServiceConfig as V2ServiceConfig } from "@/lib/pricing-v2/types";

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

// Adopt the v2 engine ServiceConfig schema to ensure parity across preview and persistence
export const ServiceConfigSchema = V2ServiceConfig;

export const CreateServiceSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]{3,}$/).optional(),
  active: z.boolean().default(true),
  config: ServiceConfigSchema,
});
export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;
