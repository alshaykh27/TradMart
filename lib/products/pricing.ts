/**
 * Pricing arithmetic shared by the server-side product writers and the admin
 * form's live preview. Deliberately dependency-free so a Client Component can
 * import it without pulling zod or Supabase into the browser bundle.
 *
 * A product's storefront `price` is ALWAYS derived:
 *     price = cost_price + commission
 * A null commission means "no markup", so it contributes 0 and the display
 * price collapses back to the cost. The browser never supplies a price; the
 * preview here is for the merchant's convenience and the writers in
 * lib/admin/manual-product.ts and app/api/admin/products/[id]/route.ts are
 * authoritative.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Display price for any product; never negative. */
export function displayPrice(costPrice: number, commission: number): number {
  const cost = Number.isFinite(costPrice) ? Math.max(0, costPrice) : 0;
  const fee = Number.isFinite(commission) ? Math.max(0, commission) : 0;
  return round2(cost + fee);
}

/**
 * Display price for a product whose cost comes from Safka rather than the
 * merchant (a synced row, or a manual row being re-priced).
 *
 * Returns null when the cost is unknown — there is nothing to add the
 * commission to, so the caller must NOT silently keep the stale price it
 * already has. Reporting "no derivation possible" lets the writer fail loudly
 * instead of showing the customer an unmarked-up price.
 */
export function deriveSyncedPrice(
  costPrice: number | null | undefined,
  commission: number | null | undefined,
): number | null {
  if (costPrice == null) return null;
  return displayPrice(Number(costPrice), commission == null ? 0 : Number(commission));
}

/** Upper bound accepted for a fold value (mirrors the commission cap). */
export const MAX_SHIPPING_FOLD = 100_000;

/**
 * The fold actually applied to a product: 0 when the toggle is off or the
 * stored value is unusable. Never negative, never NaN.
 */
export function shippingFoldApplied(
  included: boolean | null | undefined,
  fold: number | null | undefined,
): number {
  if (!included) return 0;
  const value = Number(fold);
  return Number.isFinite(value) && value > 0 ? round2(value) : 0;
}

/**
 * Storefront price for a product row: base (cost + commission) plus the folded
 * shipping — `585` for base 500 + fold 85. DISPLAY ONLY: orders and Safka
 * continue to use the plain `price`, so this helper must never reach the order
 * pipeline (lib/orders/*, lib/safka/order-payload.ts) or the margin math.
 */
export function storefrontPrice(
  price: number,
  included: boolean | null | undefined,
  fold: number | null | undefined,
): number {
  const base = Number.isFinite(price) ? price : 0;
  return round2(base + shippingFoldApplied(included, fold));
}

/**
 * "Free shipping" cart rule: the cart shows 0 shipping only when EVERY line is
 * folded. An empty cart is never "free" (nothing to ship), and a single
 * non-folded item brings the real per-governorate fee back, exactly as today.
 */
export function allLinesFolded(includedFlags: Array<boolean | null | undefined>): boolean {
  return includedFlags.length > 0 && includedFlags.every((flag) => flag === true);
}
