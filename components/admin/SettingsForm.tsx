"use client";
import { useState, type FormEvent } from "react";

export default function SettingsForm({
  initialMarkup,
  initialFoldDefault,
}: {
  initialMarkup: number;
  initialFoldDefault: number;
}) {
  const [markup, setMarkup] = useState(String(initialMarkup));
  const [foldDefault, setFoldDefault] = useState(String(initialFoldDefault));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(markup);
    const fold = Number(foldDefault);
    if (!Number.isFinite(value) || value < 0) {
      setMessage("القيمة غير صالحة");
      return;
    }
    if (!Number.isFinite(fold) || fold < 0) {
      setMessage("قيمة الشحن المضمّن غير صالحة");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingMarkup: value, shippingFoldDefault: fold }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(
        response.ok ? "تم الحفظ" : (json?.error ?? "تعذّر الحفظ"),
      );
    } catch {
      setMessage("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-5">
      <div>
        <label htmlFor="shipping-markup" className="mb-1.5 block text-sm font-semibold text-navy-soft">
          الزيادة على الشحن (ج.م)
        </label>
        <div className="flex items-center gap-1 rounded-2xl border border-navy/15 px-4 py-2.5 focus-within:border-brand">
          <input
            id="shipping-markup"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={markup}
            onChange={(event) => setMarkup(event.target.value)}
            className="w-full bg-transparent text-navy outline-none"
          />
          <span className="text-sm text-navy-soft">ج.م</span>
        </div>
        <p className="mt-1.5 text-xs text-navy-soft">
          تُضاف على سعر توصيل المحافظة من سافكا أثناء الطلب، لجميع المحافظات.
        </p>
      </div>

      <div>
        <label htmlFor="shipping-fold-default" className="mb-1.5 block text-sm font-semibold text-navy-soft">
          القيمة الافتراضية لتضمين الشحن (ج.م)
        </label>
        <div className="flex items-center gap-1 rounded-2xl border border-navy/15 px-4 py-2.5 focus-within:border-brand">
          <input
            id="shipping-fold-default"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={foldDefault}
            onChange={(event) => setFoldDefault(event.target.value)}
            className="w-full bg-transparent text-navy outline-none"
          />
          <span className="text-sm text-navy-soft">ج.م</span>
        </div>
        <p className="mt-1.5 text-xs text-navy-soft">
          تُملأ تلقائيًا في خانة «الشحن المضمّن» لكل منتج عند تفعيل «شحن مجاني».
          لتطابق الفاتورة مع كل المحافظات اختر قيمة ≥ أعلى رسوم توصيل.
        </p>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="rounded-2xl bg-brand px-5 py-2.5 font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
      >
        {busy ? "جارٍ الحفظ…" : "حفظ"}
      </button>

      {message ? <p className="text-sm text-success">{message}</p> : null}
    </form>
  );
}