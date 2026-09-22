-- TradeMart — Phase 4.1: shipping configuration
-- Project: nygydondwrifdrdnwiqs (eu-west-1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (idempotent).

-- ---------------------------------------------------------------------------
-- Shipping is configuration, not code: the storefront reads it from the single
-- settings row (60 EGP flat, free of charge from 1000 EGP by default).
-- ---------------------------------------------------------------------------
alter table public.settings
  add column if not exists shipping_fee            numeric(12, 2) not null default 60   check (shipping_fee >= 0),
  add column if not exists free_shipping_threshold numeric(12, 2) not null default 1000 check (free_shipping_threshold >= 0);

-- ---------------------------------------------------------------------------
-- The order keeps the money breakdown it was charged with, so a later settings
-- change never rewrites an existing order's total. `total` stays the grand total
-- (subtotal + shipping_fee).
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists subtotal    numeric(12, 2) not null default 0 check (subtotal >= 0),
  add column if not exists shipping_fee numeric(12, 2) not null default 0 check (shipping_fee >= 0);

-- Backfill pre-existing orders (they were charged no shipping).
update public.orders set subtotal = total where subtotal = 0 and total > 0;

notify pgrst, 'reload schema';
