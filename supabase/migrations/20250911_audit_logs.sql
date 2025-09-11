-- Audit logs table for admin actions
create extension if not exists pgcrypto;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  action text not null,
  entity text not null,
  entity_id uuid,
  actor_user_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_tenant_action_idx on public.audit_logs(tenant_id, action, created_at desc);

alter table public.audit_logs enable row level security;
