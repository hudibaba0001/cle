-- Create bookings table for widget submissions
create type booking_status as enum ('pending', 'accepted', 'rejected', 'cancelled');

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  service_key text not null,
  status booking_status not null default 'pending',
  
  -- Quote details (stored as used for audit trail)
  quote_request jsonb not null, -- the original QuoteRequest
  quote_response jsonb not null, -- the pricing result
  amount_due_minor integer not null, -- final total in minor currency units
  
  -- Customer info
  customer_email text not null,
  customer_phone text,
  
  -- Address/location
  address_zip text not null,
  address_street text,
  address_city text,
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Constraints
  constraint bookings_amount_positive check (amount_due_minor >= 0)
);

create index if not exists bookings_tenant_status_idx on public.bookings(tenant_id, status);
create index if not exists bookings_tenant_created_idx on public.bookings(tenant_id, created_at desc);

-- RLS policies
alter table public.bookings enable row level security;

drop policy if exists bookings_deny_all on public.bookings;
create policy bookings_deny_all on public.bookings for all using (false);
