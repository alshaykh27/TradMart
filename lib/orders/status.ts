/**
 * The single source of truth for order status, shared by the admin panel and
 * the customer tracking page so the two can never drift apart.
 *
 * The customer-facing step order is the linear happy path. `cancelled` is a
 * terminal branch off that path, not a step in it, which is why it lives
 * outside ORDER_TRACKING_STEPS.
 *
 * Arabic labels live here because Arabic is the product's primary language
 * (see AGENTS.md); the storefront stepper reads them through the dictionary so
 * `en` stays possible, while the admin panel — like the rest of `app/admin` —
 * uses hardcoded Arabic.
 */

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The linear happy path, in order, as shown to the customer. */
export const ORDER_TRACKING_STEPS = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
] as const satisfies readonly OrderStatus[];

export type OrderTrackingStep = (typeof ORDER_TRACKING_STEPS)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكَّد",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

/** Short customer-facing hint per status, shown under the stepper. */
export const ORDER_STATUS_HINTS: Record<OrderStatus, string> = {
  pending: "استلمنا طلبك وهو في قائمة المراجعة.",
  confirmed: "تم تأكيد طلبك وجاهز للتسليم.",
  shipped: "طلبك في الطريق إليك.",
  delivered: "تم تسليم الطلب. شكرًا لثقتك.",
  cancelled: "تم إلغاء هذا الطلب.",
};

export const ORDER_STATUS_BADGES: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-sky-100 text-sky-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700",
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isCancelled(status: string): boolean {
  return status === "cancelled";
}

/**
 * Index of a status within the tracking steps, or -1 when the order is
 * cancelled (a branch off the path) or carries an unknown value.
 */
export function trackingStepIndex(status: string): number {
  return (ORDER_TRACKING_STEPS as readonly string[]).indexOf(status);
}

/**
 * How many tracking steps are complete. A cancelled order reports 0 so the
 * stepper is never rendered as partially advanced for a dead order.
 */
export function completedStepCount(status: string): number {
  if (isCancelled(status)) return 0;
  const index = trackingStepIndex(status);
  return index < 0 ? 0 : index + 1;
}