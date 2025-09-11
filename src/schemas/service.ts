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

// v2.1 extensions accepted in our API (kept optional with defaults)
const FrequencyOptionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  multiplier: z.number().min(1),
});

const DynOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  impact: ModifierEffectSchema.optional(),
});

const DynamicQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("checkbox"),
    key: z.string().min(1),
    label: z.string().min(1),
    required: z.boolean().optional(),
    impact: ModifierEffectSchema.optional(),
  }),
  z.object({
    type: z.literal("radio"),
    key: z.string().min(1),
    label: z.string().min(1),
    required: z.boolean().optional(),
    options: z.array(DynOptionSchema).min(1),
  }),
  z.object({
    type: z.literal("checkbox_multi"),
    key: z.string().min(1),
    label: z.string().min(1),
    required: z.boolean().optional(),
    options: z.array(DynOptionSchema).min(1),
  }),
  z.object({
    type: z.literal("text"),
    key: z.string().min(1),
    label: z.string().min(1),
    required: z.boolean().optional(),
    pattern: z.string().optional(),
  }),
]);

// Adopt the v2 engine ServiceConfig and allow v2.1 fields
export const ServiceConfigSchema = V2ServiceConfig.and(
  z.object({
    frequencyOptions: z.array(FrequencyOptionSchema).default([]),
    dynamicQuestions: z.array(DynamicQuestionSchema).default([]),
  })
);

export const CreateServiceSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]{3,}$/).optional(),
  active: z.boolean().default(true),
  config: ServiceConfigSchema,
});
export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;
