/**
 * Pricing arithmetic shared by the server-side product writers and the admin
 * form's live preview. Deliberately dependency-free so a Client Component can
 * import it without pulling zod or Supabase into the browser bundle.
 *
 * A manual product's storefront price is ALWAYS derived:
 *     price = cost_price + commission
 * The browser never supplies a price; the preview here is for the merchant's
 * convenience and the writer in lib/admin/manual-product.ts is authoritative.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Display price for a manually-added product; never negative. */
export function displayPrice(costPrice: number, commission: number): number {
  const cost = Number.isFinite(costPrice) ? Math.max(0, costPrice) : 0;
  const fee = Number.isFinite(commission) ? Math.max(0, commission) : 0;
  return round2(cost + fee);
}