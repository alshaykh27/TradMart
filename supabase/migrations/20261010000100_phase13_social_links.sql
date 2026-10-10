-- ---------------------------------------------------------------------------
-- Phase 13 — social / contact links, editable from /admin
-- ---------------------------------------------------------------------------
-- The storefront footer (and the floating WhatsApp button) link to the owner's
-- Facebook page and WhatsApp number. Both live in the single `settings` row so
-- they can be changed from /admin/settings/social without a redeploy, exactly
-- like the Phase 8 marketing pixels.
--
-- SECURITY
-- `settings` keeps RLS enabled with NO anon/authenticated select policy, so
-- these columns are unreachable from the browser at the database level (the
-- storefront anon key cannot read them even if a query were injected). They
-- are read exclusively through the service-role client from server-only code.
-- They are public by nature — they end up as href attributes in the page.
--
-- whatsapp_number is stored EXACTLY as the owner typed it (the local Egyptian
-- form, e.g. 01094606102) so the footer can display it as-is. The wa.me link
-- is derived from it on every read (lib/social/links.ts), converting the
-- leading 0 to the +20 country code, so nobody ever maintains the number in
-- two formats.
-- ---------------------------------------------------------------------------

alter table public.settings
  add column if not exists facebook_url text,
  add column if not exists whatsapp_number text;

comment on column public.settings.facebook_url is
  'Facebook page URL rendered in the storefront footer. Public: ends up as an href.';
comment on column public.settings.whatsapp_number is
  'WhatsApp number as typed (e.g. 01094606102). Converted to an international wa.me link on read. Public: ends up as an href.';

-- Seed the current links so the storefront shows them before anyone opens
-- /admin/settings/social. coalesce keeps an owner's edit (including clearing a
-- value to NULL) if the migration is ever re-run.
update public.settings
   set facebook_url = coalesce(facebook_url, 'https://www.facebook.com/share/19yXFHuacs/'),
       whatsapp_number = coalesce(whatsapp_number, '01094606102')
 where id = '00000000-0000-0000-0000-000000000001';

notify pgrst, 'reload schema';
