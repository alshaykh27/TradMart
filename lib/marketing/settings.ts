import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SETTINGS_ID } from "@/lib/settings";
import {
  buildPublicConfig,
  normaliseMarketingSettings,
  resolvePlatforms,
  type MarketingPlatforms,
  type MarketingSettings,
  type PublicMarketingConfig,
} from "./config.ts";

/**
 * Server-side access to the marketing pixel settings.
 *
 * `settings` has RLS enabled with no anon/authenticated policy, so this must
 * run server-side with the service-role client.
 *
 * The two access tokens live here and NOWHERE else. They are never returned by
 * a Route Handler, never passed as props to a Client Component (which would
 * serialise them into the RSC payload), and never written into a <script> tag.
 * Only `getPublicMarketingConfig()` — the two Pixel IDs — crosses that line.
 */

const COLUMNS = "meta_pixel_id, meta_capi_token, tiktok_pixel_id, tiktok_api_token";

/** Full settings including both access tokens. Server-only callers only. */
export async function getMarketingSettings(): Promise<MarketingSettings> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("settings")
    .select(COLUMNS)
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Could not load marketing settings");
  }

  return normaliseMarketingSettings(data);
}

/**
 * The storefront projection: Pixel IDs only, and no access tokens. This is the
 * only shape the browser is ever allowed to see.
 */
export async function getPublicMarketingConfig(): Promise<PublicMarketingConfig> {
  try {
    return buildPublicConfig(await getMarketingSettings());
  } catch {
    // Marketing tracking must never take the storefront down.
    return { metaPixelId: null, tiktokPixelId: null };
  }
}

/** Which platform integrations are currently switched on. */
export async function getMarketingPlatforms(): Promise<MarketingPlatforms> {
  try {
    return resolvePlatforms(await getMarketingSettings());
  } catch {
    return {
      metaPixel: false,
      metaConversionsApi: false,
      tiktokPixel: false,
      tiktokEventsApi: false,
    };
  }
}
