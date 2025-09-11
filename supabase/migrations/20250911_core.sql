-- UUID/crypto
create extension if not exists pgcrypto;

-- SERVICES (ensure table exists; align tenant_id as text)
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  name text not null,
  slug text not null,
  active boolean not null default true,
  vat_rate int not null default 25,
  rut_eligible boolean not null default false,
  model text not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If an earlier migration created tenant_id as uuid, convert to text for consistent header matching
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'services' and column_name = 'tenant_id' and data_type = 'uuid'
  ) then
    alter table public.services alter column tenant_id type text using tenant_id::text;
  end if;
end $$;

create unique index if not exists services_tenant_slug_uk on public.services(tenant_id, slug);
create index if not exists services_tenant_active_idx on public.services(tenant_id, active);
create index if not exists services_model_idx on public.services(model);
create index if not exists services_gin_config_idx on public.services using gin (config jsonb_path_ops);

-- BOOKINGS
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  service_id uuid not null references public.services(id) on delete restrict,
  status text not null default 'pending', -- pending, accepted, rejected, canceled
  currency text not null,
  total_minor bigint not null,
  vat_minor bigint not null default 0,
  rut_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  snapshot jsonb not null,                -- full quote snapshot for audit
  customer jsonb not null,                -- {name,email,phone,address}
  idempotency_key text,
  rejected_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bookings_tenant_idem_uk on public.bookings(tenant_id, idempotency_key) where idempotency_key is not null;
create index if not exists bookings_tenant_status_idx on public.bookings(tenant_id, status);

-- AUDIT LOGS
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  action text not null,
  entity text not null,
  entity_id uuid,
  actor_user_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_tenant_action_idx on public.audit_logs(tenant_id, action, created_at desc);

-- RLS
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.audit_logs enable row level security;

-- Policies assume a JWT claim: request.jwt.claims ->> 'tenant_id'
-- If you bootstrap with service-role, your API must enforce x-tenant-id equality.
create policy if not exists svc_select on public.services for select
  using (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));
create policy if not exists svc_all on public.services for all
  using (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''))
  with check (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));

create policy if not exists bkg_select on public.bookings for select
  using (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));
create policy if not exists bkg_all on public.bookings for all
  using (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''))
  with check (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));

create policy if not exists aud_select on public.audit_logs for select
  using (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));
create policy if not exists aud_insert on public.audit_logs for insert
  with check (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));
