"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type CancelResponse = {
  ok?: boolean;
  error?: string;
  warning?: string;
  safkaManualActionRequired?: boolean;
};

/**
 * "إلغاء الطلب" with a mandatory confirmation step.
 *
 * When the order already has a safka_order_id there is no confirmed Safka
 * cancel-order API, so the panel says up front that the cancellation is local
 * only and must be mirrored in Safka's own dashboard. After a successful
 * cancel, the same warning is shown as the result so it cannot be missed.
 */
export default function CancelOrderButton({
  orderId,
  safkaOrderId,
  status,
}: {
  orderId: string;
  safkaOrderId: string | null;
  status: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const alreadyCancelled = status === "cancelled";
  const sentToSafka = Boolean(safkaOrderId);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
      });
      const json = (await response.json().catch(() => ({}))) as CancelResponse;
      if (!response.ok || !json.ok) {
        setError(json?.error ?? "تعذّر إلغاء الطلب");
        setBusy(false);
        return;
      }
      setConfirming(false);
      setWarning(json.warning ?? null);
      router.refresh();
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setBusy(false);
    }
  }

if (alreadyCancelled) {
    const safkaNote =
      warning ??
      (sentToSafka
        ? "راجع لوحة تحكم سافكا وألغِ الطلب هناك أيضًا."
        : null);

    return (
      <div className="space-y-2 rounded-2xl bg-rose-50 p-4">
        <p className="text-sm font-bold text-rose-700">هذا الطلب ملغٍ</p>
        {safkaNote ? <p className="text-sm text-rose-700">{safkaNote}</p> : null}
      </div>
    );
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-2xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-50"
        >
          إلغاء الطلب
        </button>
        {warning ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {warning}
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-rose-50 p-4">
      <p className="text-sm font-bold text-rose-700">
        هل أنت متأكد من إلغاء هذا الطلب؟
      </p>
      <p className="text-sm text-rose-700">
        ستتوقف معالجة الطلب وتظهر حالته للعميل كـ«ملغي».
      </p>

      {sentToSafka ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          تنبيه: هذا الطلب مُرسل إلى سافكا (رقم{" "}
          <span dir="ltr" className="font-mono">
            {safkaOrderId}
          </span>
          ). سيُلغى عندنا فقط — يجب إلغاؤه يدويًا من لوحة تحكم سافكا أيضًا.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-40"
        >
          {busy ? "جارٍ الإلغاء…" : "نعم، ألغِ الطلب"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={busy}
          className="rounded-2xl border border-navy/15 px-4 py-2 text-sm text-navy-soft transition hover:bg-white disabled:opacity-50"
        >
          تراجع
        </button>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}