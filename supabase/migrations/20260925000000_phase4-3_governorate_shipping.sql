-- TradeMart — Phase 4.3: per-governorate shipping from Safka's price list
-- Project: nygydondwrifdrdnwiqs (eu-west-1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (idempotent).

-- ---------------------------------------------------------------------------
-- The flat 60 EGP shipping fee was LOWER than Safka's real per-governorate
-- price (Cairo = 85), so it lost money per order. Shipping now comes from
-- Safka's price-list endpoint: the storefront keeps the list in a sync table
-- that npm run sync:governorates (hourly cron) refreshes.
--
--   governorate_id       = Safka price-list (pricing) document _id. This is
--                          EXACTLY what the create-order contract sends as
--                          shipping_governorate, so we store it on the order.
--   name_ar / name_en    = customer-facing names (checked out in Arabic).
--   safka_shipping_fee   = Safka's real fee for that governorate (EGP).
--
-- anon may read this table so the checkout <select> works; only service_role
-- (the sync script) writes it. RLS stays on.
-- ---------------------------------------------------------------------------
create table if not exists public.governorate_pricing (
  governorate_id      text primary key,
  name_ar             text not null,
  name_en             text not null default '',
  safka_shipping_fee  numeric(12, 2) not null check (safka_shipping_fee >= 0),
  updated_at          timestamptz not null default now()
);

comment on table public.governorate_pricing is
  'Safka price-list governorates (id, names, shipping fee), refreshed by npm run sync:governorates.';

alter table public.governorate_pricing enable row level security;

drop policy if exists "anon read governorate pricing" on public.governorate_pricing;
create policy "anon read governorate pricing"
  on public.governorate_pricing
  for select
  to anon
  using (true);

-- ---------------------------------------------------------------------------
-- Orders: remember which Safka price-list governorate was charged, so it can
-- be forwarded verbatim to Safka when order sending is enabled.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists shipping_governorate text;

-- ---------------------------------------------------------------------------
-- Settings: the flat fee / free-shipping threshold are REPLACED by the
-- per-governorate fees. What remains configurable is an optional fixed markup
-- added on top of Safka's fee (default 0 — the merchant decides later).
-- ---------------------------------------------------------------------------
alter table public.settings
  add column if not exists shipping_markup numeric(12, 2) not null default 0 check (shipping_markup >= 0);

alter table public.settings drop column if exists shipping_fee;
alter table public.settings drop column if exists free_shipping_threshold;

notify pgrst, 'reload schema';