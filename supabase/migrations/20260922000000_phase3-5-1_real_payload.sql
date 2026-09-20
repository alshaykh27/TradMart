-- TradeMart — Phase 3.5.1: real Safka "Product Hook" payload support
-- Project: nygydondwrifdrdnwiqs (eu-west-1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (idempotent).

-- ---------------------------------------------------------------------------
-- New columns learned from the real hook payload:
--   barcode   — unique merchant barcode; upsert fallback when _id is absent
--   images    — full image gallery (jsonb array of URLs), main image first
--   variants  -- multi-property variants (jsonb) when properties.length > 1
--   media_url — internal drive/media link; stored but never sent to the browser
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists barcode    text,
  add column if not exists images     jsonb,
  add column if not exists variants   jsonb,
  add column if not exists media_url  text;

create unique index if not exists products_barcode_unique
  on public.products (barcode)
  where barcode is not null;

-- The storefront may now read the image gallery and the variants. barcode,
-- media_url and the cost/commission fields stay service-role only.
revoke select on public.products from anon, authenticated;
grant select (
  id, safka_product_id, name, description, price, image_url, stock, status,
  is_published, created_at, updated_at, images, variants
) on public.products to anon, authenticated;

notify pgrst, 'reload schema';