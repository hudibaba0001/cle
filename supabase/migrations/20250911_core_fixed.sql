-- UUID/crypto
create extension if not exists pgcrypto;

-- Drop existing tables if they exist (for clean slate)
drop table if exists public.audit_logs cascade;
drop table if exists public.bookings cascade;
drop table if exists public.services cascade;

-- SERVICES table (fresh creation)
create table public.services (
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

create unique index services_tenant_slug_uk on public.services(tenant_id, slug);
create index services_tenant_active_idx on public.services(tenant_id, active);
create index services_model_idx on public.services(model);
create index services_gin_config_idx on public.services using gin (config jsonb_path_ops);

-- BOOKINGS table
create table public.bookings (
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

create unique index bookings_tenant_idem_uk on public.bookings(tenant_id, idempotency_key) where idempotency_key is not null;
create index bookings_tenant_status_idx on public.bookings(tenant_id, status);

-- AUDIT LOGS table
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  action text not null,
  entity text not null,
  entity_id uuid,
  actor_user_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index audit_tenant_action_idx on public.audit_logs(tenant_id, action, created_at desc);

-- Enable RLS
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.audit_logs enable row level security;

-- RLS Policies (using simple approach)
-- Services policies
create policy services_tenant_policy on public.services
  using (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));

-- Bookings policies  
create policy bookings_tenant_policy on public.bookings
  using (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));

-- Audit logs policies
create policy audit_logs_select_policy on public.audit_logs for select
  using (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));
  
create policy audit_logs_insert_policy on public.audit_logs for insert
  with check (tenant_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',''));
