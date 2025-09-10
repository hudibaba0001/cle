-- Services v2 table for Pricing Engine v2 configs
create extension if not exists pgcrypto;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  slug text not null,
  active boolean not null default true,
  vat_rate integer not null default 25,
  rut_eligible boolean not null default false,
  model text not null,
  config jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If table already existed (legacy), add missing columns
alter table public.services add column if not exists slug text;
alter table public.services add column if not exists active boolean not null default true;
alter table public.services add column if not exists vat_rate integer not null default 25;
alter table public.services add column if not exists rut_eligible boolean not null default false;
alter table public.services add column if not exists model text;
alter table public.services add column if not exists config jsonb;
alter table public.services add column if not exists created_by uuid;
alter table public.services add column if not exists created_at timestamptz not null default now();
alter table public.services add column if not exists updated_at timestamptz not null default now();

-- Uniqueness per tenant
create unique index if not exists services_tenant_slug_uk on public.services(tenant_id, slug);

-- Search/index helpers
create index if not exists services_tenant_active_idx on public.services(tenant_id, active);
create index if not exists services_model_idx on public.services(model);
create index if not exists services_gin_config_idx on public.services using gin (config jsonb_path_ops);

-- Enable RLS (service role will bypass)
alter table public.services enable row level security;
