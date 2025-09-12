import { ServiceConfig, ModifierRule } from "./types";

export type PriceEffect = {
  target: "base_after_frequency" | "subtotal_before_modifiers";
  mode: "percent" | "fixed";
  value: number;
  direction: "increase" | "decrease";
  rutEligible?: boolean;
  label?: string;
};

export type FrequencyOption = { key: string; label: string; multiplier: number };
export type CheckboxQ = { type: "checkbox"; key: string; label: string; required?: boolean; impact?: PriceEffect };
export type RadioQ = { type: "radio"; key: string; label: string; required?: boolean; options: Array<{ value: string; label: string; impact?: PriceEffect }> };
export type CheckboxMultiQ = { type: "checkbox_multi"; key: string; label: string; required?: boolean; options: Array<{ value: string; label: string; impact?: PriceEffect }> };
export type TextQ = { type: "text"; key: string; label: string; required?: boolean; pattern?: string };
export type DynamicQuestion = CheckboxQ | RadioQ | CheckboxMultiQ | TextQ;

export type ServiceWithDynamic = ServiceConfig & {
  frequencyOptions?: FrequencyOption[];
  dynamicQuestions?: DynamicQuestion[];
};

export function getFrequencyMultiplier(service: ServiceWithDynamic, requested?: string): number {
  const builtIn = (service.frequencyMultipliers ?? { one_time: 1, weekly: 1, biweekly: 1.15, monthly: 1.4 }) as Record<string, number>;
  if (!requested) return builtIn.one_time ?? 1;
  if (requested in builtIn) return builtIn[requested] ?? 1;
  const customs = service.frequencyOptions;
  const hit = customs?.find(o => o.key === requested);
  const m = hit?.multiplier;
  return typeof m === "number" && m >= 1 ? m : 1;
}

// Expand answers for radio/checkbox-multi to boolean flags that engine boolean conditions can consume
export function expandAnswersForDynamic(service: ServiceWithDynamic, answers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(answers || {}) };
  const dynQs = service.dynamicQuestions;
  if (!Array.isArray(dynQs)) return out;
  for (const q of dynQs) {
    const a = (answers as Record<string, unknown>)[q.key];
    if (q.type === "radio") {
      for (const opt of q.options) out[`${q.key}__is__${opt.value}`] = a === opt.value;
    } else if (q.type === "checkbox_multi") {
      const arr = Array.isArray(a) ? (a as unknown[]) : [];
      for (const opt of q.options) out[`${q.key}__has__${opt.value}`] = arr.includes(opt.value);
    }
  }
  return out;
}

export function compileDynamicToModifiers(service: ServiceWithDynamic): ModifierRule[] {
  const mods: ModifierRule[] = [];
  const dynQs = service.dynamicQuestions;
  if (!Array.isArray(dynQs)) return mods;

  for (const q of dynQs) {
    if (q.type === "checkbox" && q.impact) {
      mods.push({
        key: `dyn_${q.key}`,
        label: q.label || q.key,
        condition: { type: "boolean", when: true, answerKey: q.key },
        effect: { ...q.impact, rutEligible: false },
      });
      continue;
    }
    if (q.type === "radio" || q.type === "checkbox_multi") {
      for (const opt of q.options) {
        if (!opt.impact) continue;
        const answerKey = q.type === "radio" ? `${q.key}__is__${opt.value}` : `${q.key}__has__${opt.value}`;
        mods.push({
          key: `dyn_${q.key}_${opt.value}`,
          label: `${q.label || q.key}: ${opt.label || opt.value}`,
          condition: { type: "boolean", when: true, answerKey },
          effect: { ...opt.impact, rutEligible: false },
        });
      }
    }
  }
  return mods;
}

export function coerceFrequencyToBuiltin(requested?: string): "one_time" | "weekly" | "biweekly" | "monthly" {
  const allowed = new Set(["one_time", "weekly", "biweekly", "monthly"]);
  return (requested && allowed.has(requested)) ? (requested as "one_time" | "weekly" | "biweekly" | "monthly") : "one_time";
}

export function listAllowedFrequencyKeys(service: ServiceWithDynamic): string[] {
  const builtins = ["one_time", "weekly", "biweekly", "monthly"];
  const customs = (service.frequencyOptions ?? []).map(o => o.key);
  return [...builtins, ...customs];
}

export class UnknownFrequencyError extends Error {
  allowed: string[];
  constructor(allowed: string[]) {
    super("UNKNOWN_FREQUENCY");
    this.allowed = allowed;
  }
}

export function resolveFrequencyKeyOrThrow(service: ServiceWithDynamic, key?: string): number {
  const builtIn = (service.frequencyMultipliers ?? { one_time: 1, weekly: 1, biweekly: 1.15, monthly: 1.4 }) as Record<string, number>;
  if (!key) return builtIn.one_time ?? 1;
  if (key in builtIn) {
    const v = builtIn[key] ?? 1;
    if (typeof v === "number" && v >= 1) return v;
  }
  const hit = (service.frequencyOptions ?? []).find(o => o.key === key);
  if (hit && typeof hit.multiplier === "number" && hit.multiplier >= 1) return hit.multiplier;
  throw new UnknownFrequencyError(listAllowedFrequencyKeys(service));
}


