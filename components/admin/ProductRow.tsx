"use client";
import { useMemo, useState } from "react";
import { computeMargin } from "@/lib/admin/margin";
import { storefrontPrice } from "@/lib/products/pricing";
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
  /**
   * Safka's suggested selling price, parsed from the product note by the sync.
   * Null when the note is absent, malformed, or describes two quantity tiers —
   * in which case the "use suggested commission" button is not rendered at all.
   */
  safka_suggested_price?: number | null;
  /** suggested_price - cost_price, so applying it lands on the exact figure. */
  safka_suggested_commission?: number | null;
  /** "Free shipping" fold into the displayed price (display-only). */
  shipping_included?: boolean;
  shipping_fold?: number | null;
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
  shippingFeeRange = null,
}: {
  product: AdminProduct;
  categories?: CategoryOption[];
  /** In bulk mode the per-row dropdown is replaced by a selection checkbox. */
  bulkMode?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
  /** Min / max / typical per-governorate Safka fee, for the fold warning. */
  shippingFeeRange?: { min: number; max: number; typical: number } | null;
}) {
  const [commission, setCommission] = useState(
    product.commission == null ? "" : String(product.commission),
  );
  const [isPublished, setIsPublished] = useState(product.is_published);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState<"commission" | "publish" | "category" | "shipping" | null>(null);
  const [editing, setEditing] = useState(false);
  /**
   * Optimistic copy of the assigned category. The quick field saves on change,
   * so it needs its own state to render the new selection immediately instead
   * of waiting for router.refresh() to hand back a new prop.
   */
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");

  // Free-shipping fold: local copies so the box can preview the storefront
  // price without waiting for router.refresh(), just like the commission field.
  const [shippingIncluded, setShippingIncluded] = useState(
    product.shipping_included === true,
  );
  const [shippingFold, setShippingFold] = useState(
    product.shipping_fold == null ? "" : String(product.shipping_fold),
  );

  const isManual = product.source === "manual";

  const parsed = commission.trim() === "" ? null : Number(commission);
  const commissionValid =
    commission.trim() === "" || (Number.isFinite(parsed) && (parsed ?? -1) >= 0);

  const foldedValue = shippingFold.trim() === "" ? null : Number(shippingFold);
  const foldedValid =
    shippingFold.trim() === "" ||
    (Number.isFinite(foldedValue) && (foldedValue ?? -1) >= 0);
  const foldedApplied =
    shippingIncluded && Number.isFinite(foldedValue) && (foldedValue ?? 0) > 0
      ? storefrontPrice(product.price, true, foldedValue)
      : product.price;
  const foldBelowTypical =
    shippingIncluded &&
    foldedValue !== null &&
    Number.isFinite(foldedValue) &&
    shippingFeeRange !== null &&
    foldedValue < shippingFeeRange.typical;

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

  /**
   * Safka's suggested commission, but only when it is genuinely applicable: a
   * Safka-backed row whose sync recorded both a suggested price and a derived
   * markup. A manual product has no supplier, and a product whose note was
   * absent or multi-tier has no single suggestion — in both cases this stays
   * null and the button is not rendered, rather than being disabled or
   * silently defaulting to 0.
   */
  const suggestedCommission = useMemo(() => {
    if (isManual) return null;
    if (product.cost_price == null) return null;
    if (product.safka_suggested_price == null) return null;
    const derived = Number(product.safka_suggested_commission);
    return Number.isFinite(derived) && derived > 0 ? derived : null;
  }, [isManual, product.cost_price, product.safka_suggested_price, product.safka_suggested_commission]);

  async function applySuggestedCommission() {
    if (suggestedCommission === null) return;
    setCommission(String(suggestedCommission));
    await saveCommission(suggestedCommission);
  }

  async function saveCommission(explicit?: number | null) {
    // An explicit value bypasses the input, whose state has not yet re-rendered
    // when a button sets it and saves in the same click. Everything after this
    // line is identical either way, so the suggested-commission button reuses
    // this exact request rather than owning a second pricing path.
    const value = explicit === undefined ? parsed : explicit;
    const valid = value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
    if (!valid) {
      setMessage({ text: "العمولة غير صالحة", ok: false });
      return;
    }
    setSaving("commission");
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commission: value }),
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

  async function saveShippingFold() {
    if (shippingIncluded && !Number.isFinite(foldedValue ?? NaN)) {
      setMessage({ text: "حدّد قيمة الشحن المضمّن", ok: false });
      return;
    }
    if (!foldedValid) {
      setMessage({ text: "قيمة الشحن المضمّن غير صالحة", ok: false });
      return;
    }
    setSaving("shipping");
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Folding never touches price: the server writes only the two display
        // columns (and resolves the settings default when the fold is blank).
        body: JSON.stringify({
          shippingIncluded: shippingIncluded,
          shippingFold: shippingIncluded ? (foldedValue ?? null) : null,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(
        response.ok
          ? shippingIncluded
            ? { text: "تم تفعيل «الشحن مجاني» للمنتج", ok: true }
            : { text: "تم إيقاف «الشحن مجاني» للمنتج", ok: true }
          : { text: json?.error ?? "تعذّر الحفظ", ok: false },
      );
    } catch {
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
    shipping_included: product.shipping_included === true,
    shipping_fold: product.shipping_fold ?? null,
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
                onClick={() => saveCommission()}
                disabled={saving === "commission" || !commissionValid}
                className="rounded-2xl bg-navy px-3 text-sm font-semibold text-white transition hover:bg-navy-soft disabled:opacity-40"
              >
                {saving === "commission" ? "…" : "حفظ"}
              </button>
            </div>
            {suggestedCommission !== null && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand/25 bg-brand-soft/40 px-3 py-2">
                <span className="text-xs text-navy-soft">
                  سعر البيع المقترح{" "}
                  <strong className="text-navy">
                    {formatMoney(Number(product.safka_suggested_price))}
                  </strong>
                  {" · "}
                  العمولة{" "}
                  <strong className="text-navy">{formatMoney(suggestedCommission)}</strong>
                </span>
                <button
                  type="button"
                  onClick={applySuggestedCommission}
                  disabled={saving === "commission"}
                  className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-40"
                >
                  استخدم عمولة صفقة المقترحة
                </button>
              </div>
            )}
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

        <div className="rounded-2xl border border-navy/10 bg-slate-50/60 p-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-navy">
            <input
              type="checkbox"
              checked={shippingIncluded}
              onChange={(event) => setShippingIncluded(event.target.checked)}
              className="size-4 accent-brand"
            />
            تضمين الشحن في السعر — «شحن مجاني»
          </label>

          <div className="mt-2 flex gap-2">
            <div className="flex flex-1 items-center gap-1 rounded-2xl border border-navy/15 bg-white px-3 py-2 focus-within:border-brand">
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={shippingFold}
                onChange={(event) => setShippingFold(event.target.value)}
                disabled={!shippingIncluded}
                placeholder="مثال: 85"
                className="w-full bg-transparent text-sm text-navy outline-none disabled:opacity-40"
              />
              <span className="text-xs text-navy-soft">ج.م</span>
            </div>
            <button
              type="button"
              onClick={saveShippingFold}
              disabled={saving === "shipping" || (shippingIncluded && !foldedValid)}
              className="rounded-2xl bg-navy px-3 text-sm font-semibold text-white transition hover:bg-navy-soft disabled:opacity-40"
            >
              {saving === "shipping" ? "…" : "حفظ"}
            </button>
          </div>

          <p className="mt-1.5 text-xs text-navy-soft">
            سعر العرض للعميل:{" "}
            <strong className="text-navy">
              {formatMoney(shippingIncluded ? foldedApplied : product.price)}
            </strong>
            {shippingIncluded ? " — الشحن يظهر مجانًا في السلة، بشرط ألا يضمّنها منتجات أخرى غير مضمّنة" : ""}
          </p>

          {shippingFeeRange ? (
            <p className="mt-1 text-xs text-navy-soft">
              رسوم توصيل سافكا: من {formatMoney(shippingFeeRange.min)} إلى{" "}
              {formatMoney(shippingFeeRange.max)} · المتوسط{" "}
              {formatMoney(shippingFeeRange.typical)}
            </p>
          ) : null}

          {foldBelowTypical ? (
            <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-amber-700">
              ⚠ القيمة أقل من متوسط رسوم التوصيل — بعض المحافظات أغلى، وسيظهر
              فرق بين الإجمالي المعروض في السلة والفاتورة الفعلية عند الاستلام.
            </p>
          ) : null}
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