import { z } from "zod";

export const ZipRule = z.object({
  enabled: z.boolean(),
  allow: z.array(z.string().min(1)),
  message: z.string().default("Out of area"),
});

export const FormDefinition = z.object({
  theme: z.object({ mode: z.enum(["light","dark","auto"]).default("auto"), locale: z.string().default("en") }).partial().default({}),
  zipValidation: ZipRule,
  services: z.object({ ids: z.array(z.string().uuid()).min(1) }),
});

export type FormDefinitionT = z.infer<typeof FormDefinition>;


