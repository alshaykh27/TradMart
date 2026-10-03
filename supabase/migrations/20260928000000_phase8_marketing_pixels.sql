-- ---------------------------------------------------------------------------
-- Phase 8 — marketing pixels (Meta + TikTok), configurable from /admin
-- ---------------------------------------------------------------------------
-- The merchant manages the Meta Pixel, the Meta Conversions API token, the
-- TikTok Pixel and the TikTok Events API token from the admin panel, so no
-- redeploy is needed to change or rotate any of them.
--
-- SECURITY
-- `settings` keeps RLS enabled with NO anon/authenticated select policy, so the
-- two access-token columns are unreachable from the browser at the database
-- level (the storefront anon key cannot read them even if a query were
-- injected). They are read exclusively through the service-role client from
-- server-only code. The public storefront receives the two Pixel IDs and
-- nothing else.
--
-- `facebook_pixel_id` shipped in init.sql but has never been read or written
-- by any code, so renaming it to `meta_pixel_id` (to match the Conversions API
-- naming used here) cannot lose data. The rename is guarded so it is a no-op on
-- a database that already has the new name.
-- ---------------------------------------------------------------------------

alter table public.settings
  add column if not exists meta_pixel_id text,
  add column if not exists meta_capi_token text,
  add column if not exists tiktok_pixel_id text,
  add column if not exists tiktok_api_token text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'settings' and column_name = 'facebook_pixel_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'settings' and column_name = 'meta_pixel_id'
  ) then
    alter table public.settings rename column facebook_pixel_id to meta_pixel_id;
  end if;
end
$$;

comment on column public.settings.meta_pixel_id is
  'Meta (Facebook) Pixel ID. Public: rendered into the storefront script tag.';
comment on column public.settings.meta_capi_token is
  'Meta Conversions API access token. Server-only; never sent to the browser.';
comment on column public.settings.tiktok_pixel_id is
  'TikTok Pixel ID. Public: rendered into the storefront script tag.';
comment on column public.settings.tiktok_api_token is
  'TikTok Events API access token. Server-only; never sent to the browser.';

-- Blank ID or blank token simply means that platform is skipped: no script is
-- rendered and no server-side call is made. There is no flag column to keep in
-- sync, so the owner can add, change or clear any value from the admin panel and
-- have it take effect on the next request.

notify pgrst, 'reload schema';
