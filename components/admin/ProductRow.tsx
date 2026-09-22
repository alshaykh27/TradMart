"use client";
import { useMemo, useState } from "react";
import { computeMargin } from "@/lib/admin/margin";

export type AdminProduct = {
  id: string;
  name: string;
  price: number;
  cost_price: number | null;
  commission: number | null;
  is_published: boolean;
  status: string;
  safka_product_id: string;
  image_url: string | null;
  stock: number;
};

function formatMoney(value: number): string {
  return `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
}

export default function ProductRow({ product }: { product: AdminProduct }) {
  const [commission, setCommission] = useState(
    product.commission == null ? "" : String(product.commission),
  );
  const [isPublished, setIsPublished] = useState(product.is_published);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState<"commission" | "publish" | null>(null);

  const parsed = commission.trim() === "" ? null : Number(commission);
  const commissionValid =
    commission.trim() === "" || (Number.isFinite(parsed) && (parsed ?? -1) >= 0);

  const preview = useMemo(
    () => computeMargin(product.price, product.cost_price, parsed),
    [product.price, product.cost_price, parsed],
  );

  async function saveCommission() {
    if (!commissionValid) {
      setMessage({ text: "العمولة غير صالحة", ok: false });
      return;
    }
    setSaving("commission");
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commission: parsed }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(
        response.ok
          ? { text: "تم حفظ العمولة", ok: true }
          : { text: json?.error ?? "تعذّر الحفظ", ok: false },
      );
    } catch {
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setSaving(null);
    }
  }

  async function togglePublish() {
    setSaving("publish");
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: !isPublished }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.ok) {
        setIsPublished((value) => !value);
        setMessage({ text: "تم تحديث حالة النشر", ok: true });
      } else {
        setMessage({ text: json?.error ?? "تعذّر التحديث", ok: false });
      }
    } catch {
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-white p-4 shadow-soft sm:flex-row sm:items-start">
      <div className="flex items-center gap-3 sm:min-w-0 sm:flex-1">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-brand-soft">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl text-brand">
              🛍
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-bold text-navy">{product.name}</h3>
          <p dir="ltr" className="truncate font-mono text-xs text-navy-soft">
            {product.safka_product_id}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-navy-soft">
              {formatMoney(product.price)}
            </span>
            {product.cost_price != null ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-navy-soft">
                تكلفة: {formatMoney(product.cost_price)}
              </span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-navy-soft">
              مخزون: {product.stock}
            </span>
            {product.status !== "active" ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">
                غير نشط
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:w-64 sm:shrink-0">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-semibold text-navy-soft">عمولة سافكا</label>
          <button
            type="button"
            onClick={togglePublish}
            disabled={saving === "publish"}
            aria-label="تبديل النشر"
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
              isPublished ? "bg-success" : "bg-slate-300"
            } disabled:opacity-50`}
          >
            <span
              className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition ${
                isPublished ? "-translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1 rounded-2xl border border-navy/15 px-3 py-2 focus-within:border-brand">
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={commission}
                onChange={(event) => setCommission(event.target.value)}
                className="w-full bg-transparent text-sm text-navy outline-none"
                placeholder="بدون عمولة"
              />
              <span className="text-xs text-navy-soft">ج.م</span>
            </div>
          </div>
          <button
            type="button"
            onClick={saveCommission}
            disabled={saving === "commission" || !commissionValid}
            className="rounded-2xl bg-navy px-3 text-sm font-semibold text-white transition hover:bg-navy-soft disabled:opacity-40"
          >
            {saving === "commission" ? "…" : "حفظ"}
          </button>
        </div>

        {preview ? (
          <p
            className={`rounded-xl px-3 py-1.5 text-xs ${
              preview.low
                ? "bg-rose-50 text-rose-700"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {preview.low ? "⚠ " : ""}
            ربح: {formatMoney(preview.profit)} · هامش:{" "}
            {(preview.margin * 100).toLocaleString("ar-EG", { maximumFractionDigits: 1 })}
            ٪
            {preview.low ? " — هامش ربح منخفض" : ""}
          </p>
        ) : product.cost_price == null ? (
          <p className="rounded-xl bg-slate-50 px-3 py-1.5 text-xs text-navy-soft">
            لم تُحدَّد التكلفة — لا يمكن حساب الربح
          </p>
        ) : null}

        {message ? (
          <p
            className={`text-xs ${
              message.ok ? "text-success" : "text-rose-600"
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}