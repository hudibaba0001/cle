import { ServiceConfig, ModifierRule } from "./types";

type AnyService = ServiceConfig & Record<string, unknown>;

export function getFrequencyMultiplier(service: AnyService, requested?: string): number {
  const builtIn = (service.frequencyMultipliers ?? { one_time: 1, weekly: 1, biweekly: 1.15, monthly: 1.4 }) as Record<string, number>;
  if (!requested) return builtIn.one_time ?? 1;
  if (requested in builtIn) return builtIn[requested] ?? 1;
  const customs = (service as any).frequencyOptions as Array<{ key: string; label: string; multiplier: number }> | undefined;
  const hit = customs?.find(o => o.key === requested);
  const m = hit?.multiplier;
  return typeof m === "number" && m >= 1 ? m : 1;
}

// Expand answers for radio/checkbox-multi to boolean flags that engine boolean conditions can consume
export function expandAnswersForDynamic(service: AnyService, answers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(answers || {}) };
  const dynQs = (service as any).dynamicQuestions as Array<any> | undefined;
  if (!Array.isArray(dynQs)) return out;
  for (const q of dynQs) {
    const a = (answers as any)?.[q?.key];
    if (q?.type === "radio" && Array.isArray(q?.options)) {
      for (const opt of q.options) out[`${q.key}__is__${opt.value}`] = a === opt.value;
    } else if (q?.type === "checkbox_multi" && Array.isArray(q?.options)) {
      const arr = Array.isArray(a) ? a : [];
      for (const opt of q.options) out[`${q.key}__has__${opt.value}`] = arr.includes(opt.value);
    }
  }
  return out;
}

export function compileDynamicToModifiers(service: AnyService): ModifierRule[] {
  const mods: ModifierRule[] = [];
  const dynQs = (service as any).dynamicQuestions as Array<any> | undefined;
  if (!Array.isArray(dynQs)) return mods;

  for (const q of dynQs) {
    if (q?.type === "checkbox" && q?.impact) {
      mods.push({
        key: `dyn_${q.key}`,
        label: q.label || q.key,
        condition: { type: "boolean", when: true, answerKey: q.key },
        effect: { ...q.impact, rutEligible: false },
      });
      continue;
    }
    if ((q?.type === "radio" || q?.type === "checkbox_multi") && Array.isArray(q?.options)) {
      for (const opt of q.options) {
        if (!opt?.impact) continue;
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
  return (requested && allowed.has(requested)) ? (requested as any) : "one_time";
}


