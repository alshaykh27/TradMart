-- ---------------------------------------------------------------------------
-- Phase 12 — fold shipping into the storefront price (شحن مجاني)
-- ---------------------------------------------------------------------------
-- A merchant toggle per product: when on, the STOREFRONT shows
--
--     price = products.price (cost + commission) + shipping_fold
--
-- with a "شحن مجاني" badge, and the cart shows 0 shipping while every line in
-- the cart is folded ("all or nothing"). This is PURELY a display feature.
--
-- `price`, orders, the Safka payload and the margin math are untouched: order
-- creation still reads `products.price` and adds the real per-governorate fee.
-- `shipping_fold` is the merchant's flat assumption (default 85 EGP, seeded
-- from Cairo's fee) — intended to appear ONCE in the admin fold control.
--
-- SECURITY
-- products carries a COLUMN-level select grant (phase 3.5.1 REVOKEs the whole
-- table then grants a fixed list), so a brand-new column is service-role only
-- unless we explicitly grant it. shipping_included / shipping_fold ARE display
-- data the storefront reads, so they get the anon grant below. cost_price and
-- commission stay unreachable from the browser.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists shipping_included boolean not null default false,
  add column if not exists shipping_fold numeric(12, 2);

comment on column public.products.shipping_included is
  'When true the storefront shows price = products.price + shipping_fold with a free-shipping badge. Display-only: orders and Safka still use products.price and the real governorate fee. Default false.';
comment on column public.products.shipping_fold is
  '''Flat EGP fold'' into the displayed price (the merchant''s single assumption, default 85 seeded from Cairo''s fee). Null when shipping_included is false.';

grant select (shipping_included, shipping_fold)
  on public.products to anon, authenticated;

-- The flat default the admin fold control prefills and the PATCH route applies
-- when a product is enabled without an explicit value. 85 = Cairo''s current
-- Safka fee, so the example 500 -> 585 works out of the box.
alter table public.settings
  add column if not exists shipping_fold_default numeric(12, 2) not null default 85
  check (shipping_fold_default >= 0);

comment on column public.settings.shipping_fold_default is
  '''Flat shipping fold prefilled when a merchant enables تضمين الشحن في السعر; the product stores the resolved value. Mirror the governorate_pricing spread: pick >= the highest fee to stay honest for every governorate.''';

notify pgrst, 'reload schema';