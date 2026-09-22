/**
 * Decision logic for when an order may be transmitted to Safka.
 *
 * Two independent switches (kept separate on purpose, so flipping the master
 * switch to enable the MANUAL admin button can never turn on automatic sends):
 *   - SAFKA_ORDERS_ENABLED — master switch; nothing sends unless it is "true".
 *   - SAFKA_AUTO_FORWARD   — additionally required to allow the checkout
 *     (automatic) path. Absent/false keeps checkout in safe dry-run mode.
 *
 * Pure (no env/server imports) so the safety rail is unit-testable.
 */

export type SafkaSendMode = "admin" | "checkout";

export function isSafkaSendAllowed(input: {
  /** process.env.SAFKA_ORDERS_ENABLED === "true" */
  enabled: boolean;
  /** process.env.SAFKA_AUTO_FORWARD === "true" */
  autoForward: boolean;
  mode: SafkaSendMode;
}): boolean {
  if (!input.enabled) return false;
  // Manual admin sends are allowed as soon as the master switch is on; the
  // checkout auto-path needs its own explicit switch on top.
  return input.mode === "admin" || input.autoForward;
}