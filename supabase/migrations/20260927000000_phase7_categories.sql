-- TradeMart — Phase 7: real product categories
-- Project: nygydondwrifdrdnwiqs (eu-west-1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (idempotent).

-- ---------------------------------------------------------------------------
-- categories — the storefront sections the homepage chips render.
--
--   name_ar         Arabic display name (the store's primary language).
--   slug            URL key for /products?category=<slug>. Lowercase ASCII,
--                   so it is safe in a query string and in a link.
--   icon            optional emoji, shown on the chip / filter.
--   display_order   sort position; the homepage and /products both order by it.
--
-- Safka does NOT send categories, so category_id on a product is always set by
-- hand in the admin panel — for manual AND synced products alike.
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id             uuid primary key default gen_random_uuid(),
  name_ar        text not null check (length(trim(name_ar)) > 0),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  icon           text,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.categories is
  'Storefront sections. Seeded with the 8 Arabic sections; assignable per product by hand (Safka sends no category).';

create index if not exists categories_display_order_idx
  on public.categories (display_order, name_ar);

-- ---------------------------------------------------------------------------
-- products.category_id — nullable on purpose.
--
-- NULL means "not categorised yet": all 446 already-synced products start here
-- and stay invisible to no filter until the merchant assigns them. ON DELETE
-- SET NULL means removing a category can never break or hide a product.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists category_id uuid references public.categories (id) on delete set null;

create index if not exists products_category_id_idx
  on public.products (category_id)
  where category_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: anon may READ categories (the homepage chips and the /products filter
-- run on the public anon key). Only service_role — the admin routes — writes.
--
-- This mirrors "anon read governorate pricing" from the phase 4.3 migration.
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;

drop policy if exists "anon read categories" on public.categories;
create policy "anon read categories"
  on public.categories
  for select
  to anon
  using (true);

grant select on public.categories to anon, authenticated;

-- ---------------------------------------------------------------------------
-- products already has a COLUMN-level select grant to the browser roles (see
-- the phase 3.5.1 migration). PostgREST requires select privilege on a column
-- in order to FILTER by it, so category_id must be added to that list or
-- /products?category=<slug> fails at runtime with a permission error.
--
-- cost_price / commission / source / barcode / media_url stay out: they remain
-- service-role only.
-- ---------------------------------------------------------------------------
grant select (category_id) on public.products to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed — the 8 sections the homepage already shows, in their current order, so
-- the existing design does not break. ON CONFLICT DO NOTHING keeps this safe to
-- re-run and never renames a section the merchant has since edited.
--
-- Slugs are transliterated (not translated) so they stay short and stable.
-- ---------------------------------------------------------------------------
insert into public.categories (name_ar, slug, icon, display_order)
values
  ('إلكترونيات',   'electronics',  '💻', 10),
  ('موبايلات',     'mobiles',      '📱', 20),
  ('منزل ومطبخ',   'home-kitchen', '🏠', 30),
  ('موضة',         'fashion',      '👗', 40),
  ('جمال وعناية',  'beauty',       '💄', 50),
  ('أطفال',        'kids',         '🧸', 60),
  ('رياضة',        'sports',       '⚽', 70),
  ('أدوات',        'tools',        '🧰', 80)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
