-- supabase/migrations/0003_booking_idempotency.sql

-- 0) Add idempotency_key column if it doesn't exist
do $$ begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'bookings' 
    and column_name = 'idempotency_key'
  ) then
    alter table public.bookings add column idempotency_key text;
    create index bookings_tenant_idem_idx on public.bookings(tenant_id, idempotency_key);
  end if;
end $$;

-- 1) Inspect duplicates (safe to run)
with d as (
  select tenant_id, idempotency_key, count(*) c
  from public.bookings
  where idempotency_key is not null
  group by 1,2
  having count(*) > 1
)
select * from d;

-- 2) Backfill NULL keys to stable values (use the booking id)
update public.bookings
set idempotency_key = id::text
where idempotency_key is null;

-- 3) Deduplicate existing clashes: keep the newest row per (tenant_id, idempotency_key)
with ranked as (
  select id, tenant_id, idempotency_key,
         row_number() over (partition by tenant_id, idempotency_key order by created_at desc, id desc) as rn
  from public.bookings
)
delete from public.bookings b
using ranked r
where b.id = r.id
  and r.rn > 1;

-- 4) Drop the old partial unique index if it exists
do $$ begin
  perform 1
  from pg_indexes
  where schemaname='public' and indexname='bookings_tenant_idem_uniq';
  if found then
    execute 'drop index public.bookings_tenant_idem_uniq';
  end if;
end $$;

-- 5) Enforce NOT NULL and a real unique constraint
alter table public.bookings
  alter column idempotency_key set not null;

alter table public.bookings
  add constraint bookings_tenant_idempotency_unique
  unique (tenant_id, idempotency_key);
