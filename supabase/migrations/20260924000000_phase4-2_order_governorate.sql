-- TradeMart — Phase 4.2: store the customer's governorate
-- Project: nygydondwrifdrdnwiqs (eu-west-1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (idempotent).

-- ---------------------------------------------------------------------------
-- The Safka create-order contract requires `shipping_governorate`, which is the
-- price-list (pricing) document `_id` — not a governorate name. The storefront
-- collects the governorate name, persists it here (and, since Phase 4.3, the
-- resolved Safka `_id` in a separate `shipping_governorate` column fed from the
-- synced governorate_pricing table).
-- Nullable so pre-existing orders keep working.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists governorate text;

notify pgrst, 'reload schema';
