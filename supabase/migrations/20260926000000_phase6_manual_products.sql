-- TradeMart — Phase 6: manually-added products + product image storage
-- Project: nygydondwrifdrdnwiqs (eu-west-1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (idempotent).

-- ---------------------------------------------------------------------------
-- 1. products.source — 'safka' (mirrored from the Safka API) vs 'manual'
--    (typed in by hand from the admin panel).
--
--    Every Safka write path (product webhook + scripts/sync-safka-products.ts)
--    filters on source <> 'manual', so a sync can never overwrite, republish
--    or deactivate a hand-written product.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists source text not null default 'safka';

alter table public.products
  drop constraint if exists products_source_check;
alter table public.products
  add constraint products_source_check check (source in ('safka', 'manual'));

create index if not exists products_source_idx on public.products (source);

-- ---------------------------------------------------------------------------
-- 2. safka_product_id becomes nullable so a manual row can exist without a
--    Safka counterpart. The unique index stays: Postgres allows any number of
--    NULLs under a unique constraint, and Safka rows still must not collide.
-- ---------------------------------------------------------------------------
alter table public.products
  alter column safka_product_id drop not null;

-- ---------------------------------------------------------------------------
-- 3. Product image storage.
--
--    A public bucket: manual-product images are storefront copy, so they are
--    served straight from the public object endpoint. The storefront has no
--    authenticated users (the admin panel uses a cookie session on the
--    service-role client), so uploads and deletes go through the service-role
--    client, which bypasses RLS — no storage policies are required.
--
--    Objects are named <uuid>.<ext> by the upload route (never by the
--    submitted filename) and capped by the bucket limits below, so the route
--    and the bucket enforce the same bounds.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public              = excluded.public,
      file_size_limit     = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 4. Grants are unchanged on purpose: `source` and `cost_price` /
--    `commission` stay service-role only. The storefront needs nothing from
--    `source`, and adding a column does not disturb the existing grant list.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';