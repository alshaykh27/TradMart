/**
 * "Unsent to Safka" definition for the admin panel.
 *
 * An order counts as unsent when it has no Safka order id and is older than a
 * short grace period (the merchant gets the Telegram alert on placement, so a
 * brand-new order is not yet "forgotten"). Cancelled orders are excluded — they
 * will never be sent. Pure and unit-tested.
 */

export const UNSENT_ORDER_GRACE_MINUTES = 30;

export function unsentThresholdIso(
  now: Date = new Date(),
  minutes: number = UNSENT_ORDER_GRACE_MINUTES,
): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}