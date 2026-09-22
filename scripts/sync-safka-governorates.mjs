/**
 * TradeMart — refresh the per-governorate shipping price list.
 *
 * Fetches the Safka price list (GET /api/v1/public/price-list) and upserts it
 * into `governorate_pricing` (governorate_id = Safka document _id = the value
 * sent as shipping_governorate in the create-order contract).
 *
 * Run: npm run sync:governorates
 * Also runs hourly on Vercel (app/api/cron/sync-governorates).
 *
 * Requires .env.local with SAFKA_API_BASE_URL, SAFKA_API_KEY,
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Secrets are never printed.
 */
import { syncGovernoratePricing } from "../lib/safka/governorate-sync.ts";

try {
  const result = await syncGovernoratePricing();
  console.log(`Synced ${result.total} active governorates (removed ${result.removed} stale)`);
  if (result.cairo) {
    console.log(
      `Cairo  ${result.cairo.governorate_id}  ${result.cairo.safka_shipping_fee} EGP (shipping_governorate id)`,
    );
  }
  process.exit(0);
} catch (error) {
  console.error(
    `\nSync failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}