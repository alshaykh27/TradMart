/**
 * Pure money math for checkout. No imports and no environment access on
 * purpose: this module is unit-testable with the Node test runner and is the
 * single source of truth for how a cart becomes an order total.
 *
 * Shipping is the per-governorate Safka fee (+ optional markup), resolved by
 * the server from `governorate_pricing` and `settings` — never hardcoded here.
 */

export type OrderTotals = {
  subtotal: number;
  shippingFee: number;
  total: number;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineTotal(unitPrice: number, qty: number): number {
  return roundMoney(unitPrice * qty);
}

export function computeOrderTotals(
  subtotal: number,
  shippingFee: number,
): OrderTotals {
  const safeSubtotal = roundMoney(Math.max(0, subtotal));
  const safeShipping = roundMoney(Math.max(0, Number(shippingFee) || 0));
  return {
    subtotal: safeSubtotal,
    shippingFee: safeShipping,
    total: roundMoney(safeSubtotal + safeShipping),
  };
}