/**
 * Profit preview for the admin product editor — pure and unit-testable.
 *
 * profit = selling price − cost price − Safka commission (per unit).
 * margin  = profit / price. A margin below LOW_MARKUP_MARGIN (or any loss) is
 * flagged as low so the merchant reconsiders the price/commission.
 */

export const LOW_MARKUP_MARGIN = 0.15;

export type MarginPreview = {
  profit: number;
  margin: number;
  low: boolean;
};

export function computeMargin(
  price: number,
  costPrice: number | null | undefined,
  commission: number | null | undefined,
): MarginPreview | null {
  if (!Number.isFinite(price) || price <= 0) return null;

  const cost = costPrice == null ? 0 : Number(costPrice) || 0;
  const comm = commission == null ? 0 : Number(commission) || 0;

  const profit = price - cost - comm;
  const margin = profit / price;

  return { profit, margin, low: margin < LOW_MARKUP_MARGIN || profit <= 0 };
}