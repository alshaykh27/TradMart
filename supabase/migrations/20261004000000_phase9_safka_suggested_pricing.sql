-- ---------------------------------------------------------------------------
-- Phase 9 — Safka suggested selling price, ready for the admin commission editor
-- ---------------------------------------------------------------------------
-- Safka exposes NO structured suggested-price or commission field. Its public
-- product API returns 17 keys (verified against both /public/products and
-- /public/product/{id}) and none of them is a suggested price; the only place
-- the figure appears is the free-text `note`, where a person wrote a sentence
-- such as "سعر البيع المقترح 700 عمولتك 210". There is also no dedicated
-- pricing endpoint (/product/{id}/price, /pricing and /commission all 404).
--
-- So the sync parses that sentence once (lib/safka/suggested-price.ts) and
-- records the outcome here. Two nullable columns, never a default of 0:
--
--   safka_suggested_price       the suggested SELLING price from the note
--   safka_suggested_commission  suggested_price - cost_price, i.e. the markup
--                               that makes price land exactly on it
--
-- The commission is DERIVED from the price against the live cost rather than
-- read out of the note. The note is static text while sale_price is live, so a
-- supplier who reprices afterwards leaves the note's own commission stale --
-- measured on the live catalog, 40 of the 422 parseable notes disagree with
-- their own price by up to 100 EGP. The note's price is the figure the merchant
-- expects to charge, so that is what this guarantees.
--
-- Both stay NULL when the note is absent, malformed, or describes two quantity
-- tiers (29 of 451 live products). The admin button is then not rendered at
-- all, because there is genuinely nothing to apply -- it never falls back to 0.
--
-- SECURITY
-- `products` carries a COLUMN-level select grant (see the Phase 3.5 / 3.5.1
-- migrations), so a newly added column is service-role only by default. The
-- explicit REVOKE below documents that intent and survives a future
-- `grant select on public.products` being added by mistake: the supplier's
-- commercial terms are not the storefront's business. Read only through the
-- service-role client from server-only code.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists safka_suggested_price      numeric(12, 2),
  add column if not exists safka_suggested_commission numeric(12, 2);

comment on column public.products.safka_suggested_price is
  'Suggested selling price parsed from the Safka product note; null when the note is absent, malformed or multi-tier.';
comment on column public.products.safka_suggested_commission is
  'safka_suggested_price - cost_price; the markup that lands price exactly on the suggested price. Never derived from the note''s own commission figure, which goes stale when sale_price changes.';

revoke select (safka_suggested_price, safka_suggested_commission)
  on public.products from anon, authenticated;