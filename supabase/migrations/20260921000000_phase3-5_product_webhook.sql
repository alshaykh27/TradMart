-- TradeMart — Phase 3.5: Safka product webhook
-- Project: nygydondwrifdrdnwiqs (eu-west-1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (idempotent).

-- ---------------------------------------------------------------------------
-- Products are invisible until Safka sends its "Product Hook" for them.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists is_published boolean      not null default false,
  add column if not exists cost_price    numeric(12, 2),
  add column if not exists commission    numeric(12, 2);

update public.products set is_published = false;

create index if not exists products_published_idx
  on public.products (is_published)
  where is_published = true;

-- The storefront may read only products published through the webhook.
drop policy if exists "products_public_read_active" on public.products;
create policy "products_public_read_published"
  on public.products
  for select
  to anon, authenticated
  using (is_published = true);

-- ---------------------------------------------------------------------------
-- webhook_logs: raw payloads are kept so we can learn Safka's real hook shape.
-- Only the service-role (which bypasses RLS) may touch this table.
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_logs (
  id          bigint generated always as identity primary key,
  payload     jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.webhook_logs enable row level security;
revoke all on public.webhook_logs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Merchant cost/commission are secrets: hide the columns from browser roles.
-- ---------------------------------------------------------------------------
revoke select (cost_price) on public.products from anon, authenticated;
revoke select (commission) on public.products from anon, authenticated;

notify pgrst, 'reload schema';