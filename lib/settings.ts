import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads storefront configuration from the single `settings` row.
 *
 * `settings` has RLS enabled with no anon policy, so this must run server-side
 * with the service-role client. Only non-secret values are returned.
 *
 * Shipping is per-governorate (governorate_pricing); the only flat knob left
 * here is an optional markup added on top of Safka's fee (default 0).
 */

export const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export type OrderSettings = {
  /** Fixed EGP added on top of the governorate's Safka shipping fee. */
  shippingMarkup: number;
};

export async function getShippingSettings(): Promise<OrderSettings> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("settings")
    .select("shipping_markup")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Could not load shipping settings");
  }

  return {
    shippingMarkup: Number(data.shipping_markup) || 0,
  };
}