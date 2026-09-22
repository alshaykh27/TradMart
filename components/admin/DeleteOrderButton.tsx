"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CONFIRM_TEXT = "حذف";

export default function DeleteOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        router.replace("/admin/orders?deleted=1");
        return;
      }
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      setError(json?.error ?? "تعذّر حذف الطلب");
      setBusy(false);
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
      >
        حذف الطلب
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-rose-50 p-4">
      <p className="text-sm font-semibold text-rose-700">
        حذف نهائي — سيُحذف الطلب مع جميع عناصره ولا يمكن التراجع.
      </p>
      <p className="text-sm text-rose-700">
        اكتب «{CONFIRM_TEXT}» في الحقل ثم اضغط على زر الحذف باللون الأحمر:
      </p>
      <input
        type="text"
        autoComplete="off"
        autoFocus
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && typed === CONFIRM_TEXT) confirmDelete();
        }}
        className="w-full max-w-xs rounded-2xl border border-rose-300 bg-white px-4 py-2 text-navy outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
        placeholder={CONFIRM_TEXT}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={confirmDelete}
          disabled={busy || typed !== CONFIRM_TEXT}
          className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-40"
        >
          {busy ? "جارٍ الحذف…" : "تأكيد الحذف"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-2xl border border-navy/15 px-4 py-2 text-sm text-navy-soft hover:bg-white disabled:opacity-50"
        >
          إلغاء
        </button>
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}