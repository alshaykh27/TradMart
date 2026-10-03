import {
  completedStepCount,
  ORDER_TRACKING_STEPS,
  trackingStepIndex,
  type OrderTrackingStep,
} from "@/lib/orders/status";
import type { Dictionary } from "@/i18n";

/**
 * Customer-facing order progress indicator.
 *
 * Server Component — the page re-reads the order on every request, so the
 * stepper always renders the current status and needs no client state.
 *
 * RTL-aware: the fill is anchored with `start-0` (inline-start), so it grows
 * from the right in Arabic, matching the rest of the Cairo/RTL storefront.
 */
export default function OrderProgress({
  status,
  dict,
}: {
  status: string;
  dict: Dictionary;
}) {
  const { tracking } = dict.order;

  const stepLabels: Record<OrderTrackingStep, string> = {
    pending: tracking.steps.pending,
    confirmed: tracking.steps.confirmed,
    shipped: tracking.steps.shipped,
    delivered: tracking.steps.delivered,
  };

  const stepHints: Record<OrderTrackingStep, string> = {
    pending: tracking.pending,
    confirmed: tracking.confirmed,
    shipped: tracking.shipped,
    delivered: tracking.delivered,
  };

  // A cancelled order branches off the path, so it is never drawn as a
  // partially filled track.
  if (status === "cancelled") {
    return (
      <div className="rounded-card border border-rose-200 bg-rose-50/60 p-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="font-extrabold text-rose-800">{tracking.cancelledLabel}</p>
            <p className="mt-0.5 text-sm text-rose-700">{tracking.cancelled}</p>
          </div>
        </div>
      </div>
    );
  }

  // Unknown/legacy values fall back to the first step rather than rendering an
  // empty track, so a bad status can never produce a blank card.
  const step: OrderTrackingStep =
    trackingStepIndex(status) >= 0 ? (status as OrderTrackingStep) : "pending";
  const reached = completedStepCount(step);
  const fill = (reached / ORDER_TRACKING_STEPS.length) * 100;

  return (
    <div className="rounded-card border border-slate-200/80 bg-white p-5 shadow-soft">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
          {tracking.title}
        </h2>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-extrabold text-brand-dark">
          {stepLabels[step]}
        </span>
      </div>

      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-4 h-1 rounded-full bg-slate-100"
        />
        <div
          aria-hidden="true"
          className="absolute start-0 top-4 h-1 rounded-full bg-brand"
          style={{ width: `${fill}%` }}
        />

        <ol className="relative flex items-start justify-between gap-1">
          {ORDER_TRACKING_STEPS.map((value, index) => {
            const done = index < reached;
            const active = index === reached - 1;

            return (
              <li
                key={value}
                className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-full border-2 text-sm font-bold ${
                    done
                      ? "border-brand bg-brand text-white"
                      : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {done && !active ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={`text-xs leading-tight font-bold sm:text-sm ${
                    done ? "text-navy" : "text-slate-400"
                  }`}
                >
                  {stepLabels[value]}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p
        className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
          reached === ORDER_TRACKING_STEPS.length
            ? "bg-emerald-50 text-emerald-800"
            : "bg-brand-soft text-navy"
        }`}
      >
        {stepHints[step]}
      </p>
    </div>
  );
}