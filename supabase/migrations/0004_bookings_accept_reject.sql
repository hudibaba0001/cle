-- supabase/migrations/0004_bookings_accept_reject.sql
alter table public.bookings
  add column if not exists reject_reason text;

-- helpful index for queue
create index if not exists bookings_queue_idx
  on public.bookings (tenant_id, status, created_at desc);
