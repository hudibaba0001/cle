import { z } from "zod";

export const ZipRule = z.object({
  enabled: z.boolean(),
  allow: z.array(z.string().min(1)),
  message: z.string().default("Out of area"),
});

const FieldOption = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const FieldDef = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text","email","tel","textarea","number","radio","select","checkbox"]),
  required: z.boolean().optional().default(false),
  options: z.array(FieldOption).optional().default([]),
});

export const FormDefinition = z.object({
  theme: z.object({ mode: z.enum(["light","dark","auto"]).default("auto"), locale: z.string().default("en") }).partial().default({}),
  zipValidation: ZipRule,
  services: z.object({ ids: z.array(z.string().uuid()).default([]) }).default({ ids: [] }),
  fields: z.array(FieldDef).default([]),
});

export type FormDefinitionT = z.infer<typeof FormDefinition>;


