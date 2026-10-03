-- TradeMart — Phase 7 fix: repair the seeded section names
--
-- WHY THIS EXISTS
-- 20260927000000_phase7_categories.sql is correct and stays untouched. The
-- corruption happened in transit: the SQL was copied to the Windows clipboard
-- with PowerShell's Get-Content | Set-Clipboard and pasted into the Supabase
-- SQL Editor, and that round trip double-encoded every non-ASCII character.
-- Each Arabic character landed in the database as its UTF-8 bytes read as
-- Latin-1, so name_ar held mojibake (U+00D8 U+00A5 ...) and the same happened to
-- the emoji icons.
--
-- Symptom: the storefront chips, the /products filter and the admin dropdowns
-- all rendered "electronics" / "home-kitchen" instead of Arabic — not because
-- any component picked the wrong column, but because the column itself
-- contained garbage.
--
-- This migration repairs the eight seeded rows by slug. It is idempotent and
-- deliberately does NOT touch merchant-created sections or their display_order.
--
-- Safe to run more than once.

update public.categories as c
set name_ar = v.name_ar,
    icon     = v.icon,
    updated_at = now()
from (values
  ('electronics', 'إلكترونيات', '💻'),
  ('mobiles', 'موبايلات', '📱'),
  ('home-kitchen', 'منزل ومطبخ', '🏠'),
  ('fashion', 'موضة', '👗'),
  ('beauty', 'جمال وعناية', '💄'),
  ('kids', 'أطفال', '🧸'),
  ('sports', 'رياضة', '⚽'),
  ('tools', 'أدوات', '🧰')
) as v(slug, name_ar, icon)
where c.slug = v.slug
  — Only rewrite rows that are actually wrong, so re-running is a no-op and
  — this can never clobber a deliberate edit made in the admin panel.
  and (c.name_ar is distinct from v.name_ar or c.icon is distinct from v.icon);

notify pgrst, 'reload schema';
