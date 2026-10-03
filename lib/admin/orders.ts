/**
 * Shared admin order-status vocabulary (Arabic-first labels + badge colors).
 * The values themselves now live in lib/orders/status.ts so the customer
 * tracking page and the admin panel cannot drift apart.
 */

export {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGES,
  ORDER_TRACKING_STEPS,
  isOrderStatus,
  isCancelled,
  type OrderStatus,
  type OrderTrackingStep,
} from "@/lib/orders/status";