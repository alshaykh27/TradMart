-- TradeMart — Phase 10: Safka city ids for the create-order payload
-- Project: nygydondwrifdrdnwiqs (eu-west-1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (idempotent).

-- ---------------------------------------------------------------------------
-- POST /api/v1/public/orders rejects free-text cities. Safka casts `city` to a
-- Number, so "المنصورة" becomes NaN and the order 400s:
--
--   Order validation failed: city: Cast to Number failed for value "NaN"
--   (type number) at path "city"
--
-- `city` must be the price-list `cities[].id` for the SAME governorate as
-- `shipping_governorate`. Safka exposes no cities endpoint (all candidates
-- 404); the ids arrive nested in GET /api/v1/public/price-list, which
-- npm run sync:governorates already fetches, so those rows land here.
--
--   city_id        = Safka price-list cities[].id, e.g. "336" = Desouq.
--                    A dense global numbering (1..423, 418 present).
--   governorate_id = the price-list document `_id` this city belongs to, so
--                    checkout can filter the dropdown and the server can
--                    refuse a city from a different governorate.
--
-- anon may read this table so the checkout <select> works; only service_role
-- (the sync script) writes it. RLS stays on.
--
-- `orders.city_id` is nullable: `city` is OPTIONAL in the Safka contract, so an
-- unset or unresolvable city stores NULL and the field is omitted from the
-- payload entirely. A wrong value is never stored, never sent.
-- ---------------------------------------------------------------------------
create table if not exists public.safka_cities (
  city_id          text primary key,
  governorate_id   text not null
                     references public.governorate_pricing (governorate_id)
                     on delete cascade,
  name_ar          text not null,
  name_en          text not null default '',
  updated_at       timestamptz not null default now()
);

comment on table public.safka_cities is
  'Safka price-list cities per governorate (id, names), refreshed by npm run sync:governorates.';

create index if not exists saafka_cities_governorate_idx
  on public.safka_cities (governorate_id);

alter table public.safka_cities enable row level security;

drop policy if exists "anon read saafka_cities" on public.safka_cities;
create policy "anon read saafka_cities"
  on public.safka_cities
  for select
  to anon
  using (true);

-- ---------------------------------------------------------------------------
-- Orders: remember which Safka city id the customer chose, alongside the
-- governorate id already stored by Phase 4.3.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists city_id text;

notify pgrst, 'reload schema';
