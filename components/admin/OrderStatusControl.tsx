"use client";
import { useState } from "react";
import {
  ORDER_STATUS_LABELS,
  ORDER_TRACKING_STEPS,
  type OrderTrackingStep,
} from "@/lib/admin/orders";

/**
 * Quick status pills for the happy path only. `cancelled` is intentionally
 * absent — it needs a confirmation step and a Safka hand-off warning, so it
 * lives behind the dedicated CancelOrderButton (and POST /cancel, which is the
 * only endpoint the server accepts that status on).
 */
export default function OrderStatusControl({
  orderId,
  initialStatus,
}: {
  orderId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState<string>(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(next: OrderTrackingStep) {
    if (next === status || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (response.ok && json.ok) {
        setStatus(next);
        setMessage("تم حفظ الحالة");
      } else {
        setMessage(json?.error ?? "تعذّر تعديل الحالة");
      }
    } catch {
      setMessage("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ORDER_TRACKING_STEPS.map((option) => {
          const current = option === status;
          return (
            <button
              key={option}
              type="button"
              onClick={() => change(option)}
              disabled={busy || current}
              className={
                current
                  ? "rounded-full bg-navy px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-full border border-navy/15 px-3 py-1.5 text-sm text-navy-soft hover:bg-brand-soft disabled:opacity-50"
              }
            >
              {ORDER_STATUS_LABELS[option]}
            </button>
          );
        })}
      </div>
      {status === "cancelled" ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
          هذا الطلب ملغٍ — لا يمكن تغيير الحالة. لإلغاء التراجع استخدم حذف الطلب.
        </p>
      ) : null}
      {message ? (
        <p className="text-xs text-navy-soft">{message}</p>
      ) : null}
    </div>
  );
}