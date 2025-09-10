-- supabase/migrations/0001_pricing_core.sql
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  currency text not null default 'SEK',
  vat_rate numeric(5,2) not null default 25.00,
  rut_enabled boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  create type public.pricing_model as enum ('fixed','hourly','per_sqm','per_room','windows');
exception when duplicate_object then null; end $$;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  name text not null,
  model public.pricing_model not null,
  config jsonb not null,
  is_public boolean not null default true,
  is_active boolean not null default true,
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create index if not exists services_tenant_active_idx on public.services(tenant_id) where is_active;
create index if not exists services_tenant_key_idx on public.services(tenant_id, key);
create index if not exists services_model_idx on public.services(model);

alter table public.tenants enable row level security;
alter table public.services enable row level security;

drop policy if exists tenants_deny_all on public.tenants;
create policy tenants_deny_all on public.tenants for all using (false);

drop policy if exists services_deny_all on public.services;
create policy services_deny_all on public.services for all using (false);

-- Dev seed (demo tenant + one service)
insert into public.tenants (id, name, slug, currency, vat_rate, rut_enabled, is_active)
values ('00000000-0000-0000-0000-000000000001','Demo Cleaning AB','demo-cleaning','SEK',25.00,true,true)
on conflict (slug) do nothing;

insert into public.services (tenant_id, key, name, model, is_public, is_active, config)
values (
  '00000000-0000-0000-0000-000000000001',
  'basic_cleaning',
  'Basic Home Cleaning',
  'per_sqm',
  true, true,
  jsonb_build_object(
    'min_price', 800,
    'base_per_sqm', 25,
    'tiers', jsonb_build_array(
      jsonb_build_object('up_to', 50,  'rate', 30),
      jsonb_build_object('up_to', 100, 'rate', 25),
      jsonb_build_object('up_to', null,'rate', 20)
    ),
    'addons', jsonb_build_array(
      jsonb_build_object('key','fridge_clean','name','Fridge clean','type','fixed','amount',150),
      jsonb_build_object('key','inside_windows','name','Inside windows','type','per_unit','amount',40)
    ),
    'frequency_multipliers', jsonb_build_object(
      'one_time', 1.00, 'monthly', 0.90, 'biweekly', 0.85, 'weekly', 0.80
    ),
    'rut', jsonb_build_object('enabled', true, 'labor_ratio', 0.8)
  )
)
on conflict (tenant_id, key) do nothing;
