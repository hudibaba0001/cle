"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <FormBuilder />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <div className="h-8 w-64 rounded-xl bg-neutral-100" />
      <div className="h-56 rounded-2xl border bg-neutral-50" />
    </div>
  );
}

type ServiceRow = { id: string; name: string; model: string; active: boolean };
type ZipRule = { enabled: boolean; allow: string[]; message: string };
type FieldDef = { key: string; label: string; type: "text" | "email" | "tel" | "textarea" | "number" | "radio" | "select" | "checkbox"; required?: boolean; options?: { value: string; label: string }[] };
type FormDefinition = {
  theme?: { mode?: "light" | "dark" | "auto"; locale?: string };
  zipValidation: ZipRule;
  services: { ids: string[] };
  fields: FieldDef[];
  version?: number;
};
type DraftForm = {
  id?: string;
  tenant_id?: string;
  name: string;
  slug: string;
  status?: "draft" | "published";
  definition: FormDefinition;
};

function FormBuilder() {
  const sp = useSearchParams();
  const idFromQuery = sp.get("id") || undefined;

  const [tenantId, setTenantId] = useState<string>("demo-tenant");
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  const [tab, setTab] = useState<"basics"|"zip"|"services"|"fields"|"review"|"install">("basics");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [slugConflict, setSlugConflict] = useState(false);
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  const [knownSlugs, setKnownSlugs] = useState<string[]>([]);

  const [form, setForm] = useState<DraftForm>({
    id: idFromQuery,
    name: "New Form",
    slug: "new-form",
    definition: {
      theme: { mode: "auto", locale: "en" },
      zipValidation: { enabled: true, allow: ["123**"], message: "Out of area" },
      services: { ids: [] },
      fields: [
        { key: "first_name", label: "First name", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: true },
      ],
      version: 1,
    },
  });

  useEffect(() => {
    const load = async () => {
      if (!tenantId) return;
      setLoadingServices(true);
      try {
        const res = await fetch("/api/admin/services", { headers: { "x-tenant-id": tenantId }, cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          const items: ServiceRow[] = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
          setServices(items);
        }
      } finally {
        setLoadingServices(false);
      }
    };
    load();
  }, [tenantId]);

  const update = (patch: Partial<DraftForm>) => setForm((p) => ({ ...p, ...patch, definition: { ...p.definition, ...(patch as { definition?: FormDefinition }).definition } }));
  const setDef = (patch: Partial<FormDefinition>) => setForm((p) => ({ ...p, definition: { ...p.definition, ...patch } }));

  function slugify(s: string) {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/--+/g, "-");
  }

  function suggestSlug(base: string, existing: Set<string>) {
    const out: string[] = [];
    const b = slugify(base || "form");
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
    const pool = [
      b,
      `${b}-2`, `${b}-3`, `${b}-4`,
      `${b}-north`, `${b}-south`,
      `${b}-${ymd}`,
      `${b}-${Math.random().toString(36).slice(2, 6)}`,
    ];
    for (const s of pool) if (s && !existing.has(s)) out.push(s);
    let i = 5;
    while (out.length < 6 && i < 35) {
      const s = `${b}-${i++}`;
      if (!existing.has(s)) out.push(s);
    }
    return Array.from(new Set(out)).slice(0, 6);
  }

  async function fetchExistingSlugs(): Promise<string[]> {
    try {
      const res = await fetch("/api/admin/forms", { headers: { "x-tenant-id": tenantId }, cache: "no-store" });
      if (!res.ok) return [];
      const j: unknown = await res.json().catch(()=>({} as unknown));
      type Row = { slug: string };
      function isRow(v: unknown): v is Row {
        return typeof v === "object" && v !== null && typeof (v as { slug?: unknown }).slug === "string";
      }
      let rows: Row[] = [];
      if (Array.isArray(j)) {
        rows = (j as unknown[]).filter(isRow);
      } else if (typeof j === "object" && j && "items" in (j as Record<string, unknown>)) {
        const items = (j as { items?: unknown }).items;
        rows = Array.isArray(items) ? (items as unknown[]).filter(isRow) : [];
      }
      return rows.map((r) => r.slug).filter(Boolean);
    } catch { return []; }
  }

  async function saveDraft(override?: Partial<DraftForm>): Promise<string | null> {
    setError(null);
    if (!tenantId) { setError("TENANT_ID_REQUIRED"); return null; }
    setSaving(true);
    try {
      const payload = {
        name: override?.name ?? form.name,
        slug: slugify(override?.slug ?? form.slug),
        definition: override?.definition ?? form.definition,
      };
      const body = JSON.stringify(payload);
      if (!form.id) {
        const res = await fetch("/api/admin/forms", { method: "POST", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body });
        if (res.status === 409) {
          const slugs = await fetchExistingSlugs();
          setKnownSlugs(slugs);
          setSlugSuggestions(suggestSlug(payload.slug, new Set(slugs)));
          setSlugConflict(true);
          throw await toErr(res); // still surface the error message
        }
        if (!res.ok) throw await toErr(res);
        const j = await res.json();
        const id = j?.id as string | undefined;
        if (id) {
          update({ id });
          const u = new URL(window.location.href); u.searchParams.set("id", id); window.history.replaceState(null, "", u.toString());
        }
      } else {
        const res = await fetch(`/api/admin/forms/${form.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body });
        if (!res.ok) throw await toErr(res);
      }
      setSlugConflict(false); setSlugSuggestions([]);
      return form.id ?? null;
    } catch (e: unknown) {
      const er = e as { message?: string; status?: number; detail?: string };
      if (er?.status === 409 || /duplicate|unique/i.test(er?.detail || "")) {
        setError("SLUG_CONFLICT: That slug is already in use. Choose a suggestion below.");
      } else {
        setError(er?.message || "SAVE_FAILED");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function applySuggestedSlug(s: string) {
    update({ slug: s });
    await saveDraft({ slug: s });
  }

  async function publish() {
    setError(null);
    if (!tenantId) { setError("TENANT_ID_REQUIRED"); return; }
    if (!form.id) {
      const id = await saveDraft();
      if (!id) return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/forms/${form.id}/publish`, { method: "POST", headers: { "x-tenant-id": tenantId } });
      if (!res.ok) throw await toErr(res);
      update({ status: "published" });
      setTab("install");
    } catch (e: unknown) {
      setError((e as Error).message || "PUBLISH_FAILED");
    } finally {
      setPublishing(false);
    }
  }

  const previewInstallIframe = useMemo(() => {
    const base = (typeof window !== "undefined") ? window.location.origin : "https://your-domain";
    return `<iframe src="${base}/embed/widget?form=${form.slug}" style="width:100%;height:750px;border:0;overflow:auto" title="Booking Form: ${form.name}"></iframe>`;
  }, [form.slug, form.name]);

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Form Builder</h1>
          <p className="text-sm text-neutral-500">Create a publishable booking form (slug) to embed on your site.</p>
        </div>
        <div className="flex items-center gap-2">
          <input aria-label="Tenant ID" placeholder="Tenant ID (required)" title="Tenant ID" className="rounded-xl border px-3 py-2 text-sm" value={tenantId} onChange={(e)=>setTenantId(e.target.value)} />
          <button onClick={saveDraft} disabled={saving || !tenantId} className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">{saving ? "Saving…" : "Save Draft"}</button>
          <button onClick={publish} disabled={publishing || !tenantId} className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">{publishing ? "Publishing…" : "Publish"}</button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {[ ["basics","Basics"],["zip","ZIP rules"],["services","Services"],["fields","Fields"],["review","Review & Publish"],["install","Install"]].map(([k,label])=> (
          <button key={k} onClick={()=>setTab(k as typeof tab)} className={`rounded-xl px-3 py-2 text-sm border ${tab===k ? "bg-white shadow-sm" : "bg-neutral-50 hover:bg-neutral-100"}`} aria-current={tab===k?"page":undefined}>{label}</button>
        ))}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {tab==="basics" && (
        <Card title="Basics" subtitle="Name and slug identify your embeddable form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Form name"><input className="w-full rounded-xl border p-2 text-sm" value={form.name} onChange={(e)=>update({ name: e.target.value })} placeholder="City North" title="Form name"/></Field>
            <Field label="Slug (lowercase-hyphen)"><input className="w-full rounded-xl border p-2 text-sm" value={form.slug} onChange={(e)=>update({ slug: slugify(e.target.value) })} placeholder="city-north" title="Slug"/></Field>
          </div>
          {slugConflict && (
            <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="text-sm font-medium">Slug already taken for this tenant.</div>
              <div className="mt-2 text-sm">Try one of these:</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {slugSuggestions.map((s) => (
                  <button key={s} onClick={()=>applySuggestedSlug(s)} className="rounded-full border px-3 py-1 text-sm hover:bg-white">
                    {s}
                  </button>
                ))}
              </div>
              {knownSlugs.length>0 ? (
                <div className="mt-2 text-xs text-neutral-500">Existing: {knownSlugs.slice(0,6).join(", ")}{knownSlugs.length>6?"…":""}</div>
              ) : null}
            </div>
          )}
        </Card>
      )}

      {tab==="zip" && (
        <Card title="ZIP / Area Rules" subtitle="Control where this form can quote & accept bookings">
          <div className="space-y-3">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.definition.zipValidation.enabled} onChange={(e)=>setDef({ zipValidation: { ...form.definition.zipValidation, enabled: e.target.checked } })} /> Enable ZIP validation</label>
            <Field label="Allowed ZIPs or prefixes (comma separated, ** suffix for prefixes)"><input className="w-full rounded-xl border p-2 text-sm" value={form.definition.zipValidation.allow.join(",")} onChange={(e)=>setDef({ zipValidation: { ...form.definition.zipValidation, allow: e.target.value.split(",").map(s=>s.trim()).filter(Boolean) } })} placeholder="123**,12400" title="ZIP allow list"/></Field>
            <Field label="Blocked message"><input className="w-full rounded-xl border p-2 text-sm" value={form.definition.zipValidation.message} onChange={(e)=>setDef({ zipValidation: { ...form.definition.zipValidation, message: e.target.value } })} placeholder="Out of area" title="Blocked message"/></Field>
          </div>
        </Card>
      )}

      {tab==="services" && (
        <Card title="Services" subtitle="Choose which services this form can use">
          {loadingServices ? <div className="text-sm text-neutral-500">Loading services…</div> : services.length===0 ? <div className="text-sm text-neutral-500">No services found for this tenant.</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {services.map(s => {
                const checked = form.definition.services.ids.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                    <input type="checkbox" checked={checked} onChange={(e)=>{
                      const ids = new Set(form.definition.services.ids);
                      e.target.checked ? ids.add(s.id) : ids.delete(s.id);
                      setDef({ services: { ids: Array.from(ids) } });
                    }} />
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-auto text-neutral-500">{s.model}</span>
                  </label>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab==="fields" && (
        <Card title="Custom Fields" subtitle="Customer details to capture at booking">
          <div className="space-y-2">
            {form.definition.fields.map((f, idx)=> (
              <div key={f.key+idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                <input className="md:col-span-2 rounded-xl border p-2 text-sm" value={f.key} onChange={(e)=>updateField(idx,{ key: e.target.value })} placeholder="first_name" />
                <input className="md:col-span-2 rounded-xl border p-2 text-sm" value={f.label} onChange={(e)=>updateField(idx,{ label: e.target.value })} placeholder="First name" title="Field label"/>
                <select className="rounded-xl border p-2 text-sm" value={f.type} onChange={(e)=>updateField(idx,{ type: e.target.value as FieldDef["type"] })} title="Field type">
                  {["text","email","tel","textarea","number","radio","select","checkbox"].map(t=> <option key={t} value={t}>{t}</option>)}
                </select>
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.required} onChange={(e)=>updateField(idx,{ required: e.target.checked })} /> required</label>
              </div>
            ))}
            <button className="text-sm rounded-xl border px-3 py-2 hover:bg-neutral-50" onClick={()=>addField()}>+ Add field</button>
          </div>
        </Card>
      )}

      {tab==="review" && (
        <Card title="Review" subtitle="Draft snapshot to be published">
          <pre className="text-xs overflow-x-auto rounded-xl border p-3 bg-neutral-50">{JSON.stringify(form, null, 2)}</pre>
          <div className="text-sm text-neutral-600">Publishing freezes the definition for public routes.</div>
        </Card>
      )}

      {tab==="install" && (
        <Card title="Install" subtitle="Copy the embed code to your site">
          <Field label="iFrame snippet"><textarea className="w-full rounded-xl border p-2 text-xs" rows={5} readOnly value={previewInstallIframe} title="Install snippet" placeholder="<iframe ..."></textarea></Field>
          <div className="text-sm text-neutral-600">This loads your published form by slug:<code className="ml-1 px-2 py-1 rounded bg-neutral-100">{form.slug}</code></div>
        </Card>
      )}
    </div>
  );

  function updateField(i: number, patch: Partial<FieldDef>) {
    setForm(p => { const arr = [...p.definition.fields]; arr[i] = { ...arr[i], ...patch }; return { ...p, definition: { ...p.definition, fields: arr } }; });
  }
  function addField() {
    setForm(p => ({ ...p, definition: { ...p.definition, fields: [...p.definition.fields, { key: `field_${rand()}`, label: "New Field", type: "text", required: false }] } }));
  }
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border p-4 shadow-sm">
      <h2 className="font-medium">{title}</h2>
      {subtitle && <div className="text-sm text-neutral-600 mb-2">{subtitle}</div>}
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm block">
      <span className="text-neutral-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
async function toErr(res: Response) {
  const j = await res.json().catch(()=>({} as Record<string, unknown>));
  const msg = (j as Record<string, unknown>)?.error as string || (j as Record<string, unknown>)?.code as string || `HTTP_${res.status}`;
  const err = new Error(msg) as Error & { status?: number; detail?: string };
  err.status = res.status;
  err.detail = (j as Record<string, unknown>)?.detail as string | undefined;
  throw err;
}
function rand() { return Math.random().toString(36).slice(2,6); }


