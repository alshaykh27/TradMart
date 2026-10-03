"use client";
import { useMemo, useState } from "react";
import { computeMargin } from "@/lib/admin/margin";
import ManualProductEditor from "./ManualProductEditor";
import DeleteManualProductButton from "./DeleteManualProductButton";
import CategorySelect from "./CategorySelect";
import type { ManualProductSeed } from "./ManualProductForm";
import type { CategoryOption } from "@/lib/products/category";

export type AdminProduct = {
  id: string;
  name: string;
  price: number;
  cost_price: number | null;
  commission: number | null;
  is_published: boolean;
  status: string;
  /** null for manually-added products — they have no Safka counterpart. */
  safka_product_id: string | null;
  image_url: string | null;
  images?: unknown;
  description?: string | null;
  stock: number;
  source: "safka" | "manual";
  category_id?: string | null;
};

function formatMoney(value: number): string {
  return `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
}

export default function ProductRow({
  product,
  categories = [],
  bulkMode = false,
  selected = false,
  onToggle,
}: {
  product: AdminProduct;
  categories?: CategoryOption[];
  /** In bulk mode the per-row dropdown is replaced by a selection checkbox. */
  bulkMode?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}) {
  const [commission, setCommission] = useState(
    product.commission == null ? "" : String(product.commission),
  );
  const [isPublished, setIsPublished] = useState(product.is_published);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState<"commission" | "publish" | "category" | null>(null);
  const [editing, setEditing] = useState(false);
  /**
   * Optimistic copy of the assigned category. The quick field saves on change,
   * so it needs its own state to render the new selection immediately instead
   * of waiting for router.refresh() to hand back a new prop.
   */
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");

  const isManual = product.source === "manual";

  const parsed = commission.trim() === "" ? null : Number(commission);
  const commissionValid =
    commission.trim() === "" || (Number.isFinite(parsed) && (parsed ?? -1) >= 0);

  const preview = useMemo(
    () => computeMargin(product.price, product.cost_price, parsed),
    [product.price, product.cost_price, parsed],
  );

  // Name of the assigned section, for the badge next to price/stock. Optional
  // polish: a product with no category (or one created after this render) simply
  // shows no badge.
  const categoryName = useMemo(
    () => categories.find((option) => option.id === categoryId)?.name_ar ?? null,
    [categories, categoryId],
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

  async function assignCategory(next: string | null) {
    const previous = categoryId;
    setCategoryId(next ?? "");
    setSaving("category");
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Explicit null clears it; the server only writes category_id when the
        // key is present, so no other PATCH can wipe this assignment.
        body: JSON.stringify({ category_id: next ?? null }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(
        response.ok
          ? { text: "تم حفظ القسم", ok: true }
          : { text: json?.error ?? "تعذّر حفظ القسم", ok: false },
      );
      if (!response.ok) setCategoryId(previous);
    } catch {
      setCategoryId(previous);
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setSaving(null);
    }
  }

  const seed: ManualProductSeed = {
    name: product.name,
    description: product.description ?? null,
    images: Array.isArray(product.images) ? (product.images as string[]) : null,
    image_url: product.image_url ?? null,
    cost_price: product.cost_price ?? null,
    commission: product.commission ?? null,
    stock: product.stock,
    is_published: product.is_published,
    category_id: categoryId,
  };

  return (
    <div className="space-y-4 rounded-3xl bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex items-center gap-3 sm:min-w-0 sm:flex-1">
        {bulkMode ? (
          <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-navy-soft">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle?.(product.id)}
              aria-label={`تحديد ${product.name}`}
              className="size-4 accent-brand"
            />
            <span className="hidden sm:inline">تحديد</span>
          </label>
        ) : null}
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
          {isManual ? (
            <p className="text-xs font-semibold text-brand">مضاف يدويًا — خارج مزامنة سافكا</p>
          ) : (
            <p dir="ltr" className="truncate font-mono text-xs text-navy-soft">
              {product.safka_product_id}
            </p>
          )}
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
            {categoryName ? (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">
                {categoryName}
              </span>
            ) : null}
            {product.status !== "active" ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">
                غير نشط
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:w-64 sm:shrink-0">
        {isManual ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              disabled={saving !== null}
              className="flex-1 rounded-2xl border border-navy/15 px-4 py-2 text-sm font-semibold text-navy transition hover:bg-brand-soft disabled:opacity-40"
            >
              {editing ? "إغلاق التعديل" : "تعديل المنتج"}
            </button>
            {/* Row-level delete, manual products only. Safka rows get no
                delete affordance at all — the server refuses them anyway. */}
            <DeleteManualProductButton
              productId={product.id}
              productName={product.name}
              size="sm"
              onDeleted={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
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
          </>
        )}

        <div className="rounded-2xl border border-navy/10 bg-slate-50/60 p-2.5">
          {bulkMode ? (
            <p className="px-1 text-xs text-navy-soft">
              وضع التصنيف الجماعي — حدّد الصفوف من القائمة أعلاه
            </p>
          ) : (
            <CategorySelect
              id={`product-category-${product.id}`}
              categories={categories}
              value={categoryId}
              onChange={assignCategory}
              disabled={saving === "category"}
              hint={
                isManual
                  ? "قسم المنتج في المتجر"
                  : "سافكا لا ترسل أقسامًا — اختر القسم يدويًا وسيبقى محفوظًا عبر المزامنة"
              }
            />
          )}
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
          <p className={`text-xs ${message.ok ? "text-success" : "text-rose-600"}`}>
            {message.text}
          </p>
        ) : null}
      </div>
      </div>

      {editing && isManual ? (
        <ManualProductEditor
          productId={product.id}
          productName={product.name}
          seed={seed}
          categories={categories}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}