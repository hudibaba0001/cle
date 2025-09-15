-- Booking forms: ZIP + service allow-list (tenant-scoped)
create table if not exists public.booking_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  name text not null,
  slug text not null,
  status text not null default 'draft', -- 'draft' | 'published'
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists idx_booking_forms_tenant on public.booking_forms(tenant_id);
create index if not exists idx_booking_forms_status on public.booking_forms(tenant_id, status);

alter table public.booking_forms enable row level security;

do $$ begin
  drop policy if exists bf_tenant_isolation on public.booking_forms;
exception when others then null; end $$;

create policy bf_tenant_isolation on public.booking_forms
  using (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));


