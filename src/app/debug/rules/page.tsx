"use client";
import React, { useEffect, useState } from "react";

type ApiOut = { total_minor:number; rut_minor:number; vat_minor:number };
type Case = { name: string; req: unknown; expect: Partial<ApiOut> };

const cases: Case[] = [
  {
    name: "FixedTier 45sqm",
    req: {
      tenant: { currency:"SEK", vat_rate:0, rut_enabled:false },
      service: { model:"fixed_tier", tiers:[{min:1,max:50,price:3000},{min:51,max:60,price:4000}], vatRate:0, frequencyMultipliers:{one_time:1,weekly:1,biweekly:1.15,monthly:1.4}},
      frequency: "one_time",
      inputs: { area:45 },
      addons: [],
      applyRUT: false
    },
    expect: { total_minor: 300000 }
  },
  {
    name: "TieredMultiplier 55sqm @28",
    req: {
      tenant: { currency:"SEK", vat_rate:0, rut_enabled:false },
      service: { model:"tiered_multiplier", tiers:[{min:1,max:60,ratePerSqm:28}], minimum:0, vatRate:0, frequencyMultipliers:{one_time:1,weekly:1,biweekly:1.15,monthly:1.4}},
      frequency: "one_time",
      inputs: { area:55 },
      addons: [],
      applyRUT: false
    },
    expect: { total_minor: 154000 }
  },
  {
    name: "UniversalMultiplier 10sqm min700",
    req: {
      tenant: { currency:"SEK", vat_rate:0, rut_enabled:false },
      service: { model:"universal_multiplier", ratePerSqm:50, minimum:700, vatRate:0, frequencyMultipliers:{one_time:1,weekly:1,biweekly:1.15,monthly:1.4}},
      frequency: "one_time",
      inputs: { area:10 },
      addons: [],
      applyRUT: false
    },
    expect: { total_minor: 70000 }
  },
  {
    name: "Windows min700",
    req: {
      tenant: { currency:"SEK", vat_rate:0, rut_enabled:false },
      service: { model:"windows", windowTypes:[{key:"t1",name:"Type1",pricePerUnit:60}], minimum:700, vatRate:0, frequencyMultipliers:{one_time:1,weekly:1,biweekly:1.15,monthly:1.4}},
      frequency: "one_time",
      inputs: { windows: { t1:3 } },
      addons: [],
      applyRUT: false
    },
    expect: { total_minor: 70000 }
  },
  {
    name: "HourlyArea 45sqm",
    req: {
      tenant: { currency:"SEK", vat_rate:0, rut_enabled:false },
      service: { model:"hourly_area", hourlyRate:400, areaToHours:[{min:1,max:50,hours:3}], minimum:0, vatRate:0, frequencyMultipliers:{one_time:1,weekly:1,biweekly:1.15,monthly:1.4}},
      frequency: "one_time",
      inputs: { area:45 },
      addons: [],
      applyRUT: false
    },
    expect: { total_minor: 120000 }
  },
  {
    name: "PerRoom min700",
    req: {
      tenant: { currency:"SEK", vat_rate:0, rut_enabled:false },
      service: { model:"per_room", roomTypes:[{key:"room",name:"Room",pricePerRoom:300},{key:"bath",name:"Bath",pricePerRoom:150}], minimum:700, vatRate:0, frequencyMultipliers:{one_time:1,weekly:1,biweekly:1.15,monthly:1.4}},
      frequency: "one_time",
      inputs: { rooms: { room:2, bath:1 } },
      addons: [],
      applyRUT: false
    },
    expect: { total_minor: 75000 }
  },
  {
    name: "Frequency+RUT+Addon",
    req: {
      tenant: { currency:"SEK", vat_rate:0, rut_enabled:true },
      service: {
        model:"universal_multiplier",
        ratePerSqm:50, minimum:0, vatRate:0,
        frequencyMultipliers:{one_time:1,weekly:1,biweekly:1.15,monthly:1.4},
        rutEligible:true,
        addons:[{key:"fridge",name:"Fridge",type:"fixed",amount:200,rutEligible:true}]
      },
      frequency: "monthly",
      inputs: { area:20 },
      addons: [{ key:"fridge" }],
      applyRUT: true
    },
    expect: { total_minor: 80000, rut_minor: -80000 }
  },
];

export default function DebugRules() {
  const [results, setResults] = useState<Array<{ name:string; ok:boolean; expect: Partial<ApiOut>; got: ApiOut }>>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const out: Array<{ name:string; ok:boolean; expect: Partial<ApiOut>; got: ApiOut }> = [];
    for (const c of cases) {
      const r = await fetch("/api/pricing/v2/quote", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(c.req) });
      const j = await r.json() as ApiOut;
      out.push({ name:c.name, ok: Object.entries(c.expect).every(([k,v]) => (j as Record<string, unknown>)[k] === v), expect:c.expect, got:j });
    }
    setResults(out);
    setBusy(false);
  }

  useEffect(()=>{ run(); }, []);

  return (
    <div style={{ padding:24, fontFamily:"ui-sans-serif", display:"grid", gap:16 }}>
      <h1 style={{ fontSize:22 }}>Pricing Rules – Proof</h1>
      <button onClick={run} disabled={busy}>{busy ? "Running…" : "Re-run tests"}</button>
      <div style={{ display:"grid", gap:12 }}>
        {results.map((r,i)=>(
          <div key={i} style={{ border:"1px solid #e5e7eb", borderRadius:8, padding:12 }}>
            <div style={{ fontWeight:600 }}>
              {r.ok ? "✅" : "❌"} {r.name}
            </div>
            {!r.ok && (
              <pre style={{ whiteSpace:"pre-wrap" }}>
                Expected: {JSON.stringify(r.expect, null, 2)}{"\n"}
                Got:      {JSON.stringify({ total_minor:r.got.total_minor, rut_minor:r.got.rut_minor, vat_minor:r.got.vat_minor }, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
