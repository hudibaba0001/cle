"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Model =
  | "fixed_tier"
  | "tiered_multiplier"
  | "universal_multiplier"
  | "windows"
  | "hourly"
  | "per_room";

export default function AddServiceButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [model, setModel] = useState<Model>("hourly");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Server already handles 409→PUT in your contract; here we just create a draft.
        body: JSON.stringify({
          name: name || "New Service",
          model,
          config: seedConfig(model),
          active: false
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || j?.code || `HTTP_${res.status}`);
      }
      const j = await res.json();
      const id = j?.id;
      setOpen(false);
      // Option A: go straight to Builder v2 to edit this service
      router.push(`/admin/services/v2?service_id=${id}`);
      // Option B (dashboard flash): router.push(`/admin/services?saved=1&id=${id}`)
    } catch (e: any) {
      setError(e.message || "Failed to create service");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700"
      >
        + Add Service
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg space-y-3">
            <h3 className="font-medium">Create Service</h3>
            <label className="text-sm" htmlFor="svc-name">Name</label>
            <input
              id="svc-name"
              className="w-full rounded-xl border p-2 text-sm"
              placeholder="e.g., Recurring Clean"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="text-sm" htmlFor="svc-model">Pricing model</label>
            <select
              id="svc-model"
              className="w-full rounded-xl border p-2 text-sm"
              value={model}
              onChange={(e) => setModel(e.target.value as Model)}
            >
              <option value="hourly">Hourly</option>
              <option value="fixed_tier">Fixed Tier</option>
              <option value="tiered_multiplier">Tiered Multiplier</option>
              <option value="universal_multiplier">Universal Multiplier</option>
              <option value="windows">Windows</option>
              <option value="per_room">Per Room</option>
            </select>
            {error && <div role="alert" className="text-sm text-red-600">{error}</div>}
            <div className="flex justify-end gap-2">
              <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
              <button
                className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm disabled:opacity-60"
                onClick={submit}
                disabled={pending}
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function seedConfig(model: Model) {
  // Minimal valid defaults used by your Pricing Engine v2.1. Adjust if your server requires different shapes.
  if (model === "hourly") {
    return {
      currency: "SEK",
      rutEligible: true,
      hourlyRate: 1100,
      areaToHours: { "50": 3 },
      frequencyOptions: [{ key: "every_3_weeks", label: "Every 3 weeks", multiplier: 1 }],
      dynamicQuestions: [],
      fees: []
    };
  }
  return { currency: "SEK", rutEligible: true, dynamicQuestions: [], fees: [] };
}
