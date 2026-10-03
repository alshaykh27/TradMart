"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import CategorySelect from "./CategorySelect";
import type { CategoryOption } from "@/lib/products/category";

/**
 * Sticky action bar for bulk categorising the visible page of products.
 *
 * Selection is scoped to the rows currently on screen (at most one page, 50
 * rows), which keeps the state honest — no hidden ids accumulated across pages,
 * and the count always matches what the merchant can see.
 */
export default function BulkCategoriseBar({
  categories,
  selectedIds,
  pageCount,
  onClear,
}: {
  categories: CategoryOption[];
  selectedIds: string[];
  pageCount: number;
  onClear: () => void;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const count = selectedIds.length;

  async function apply() {
    if (count === 0) {
      setMessage({ text: "اختر منتجًا واحدًا على الأقل", ok: false });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          category_id: categoryId === "" ? null : categoryId,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        updated?: number;
        error?: string;
      };
      if (!response.ok) {
        setMessage({ text: json?.error ?? "تعذّر تصنيف المنتجات", ok: false });
        return;
      }
      setMessage({
        text: `تم تصنيف ${json.updated ?? count} منتجًا`,
        ok: true,
      });
      onClear();
      router.refresh();
    } catch {
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sticky top-2 z-10 space-y-3 rounded-3xl border border-brand/30 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-bold text-navy">
          محدد: {count} منتج
          {pageCount > 0 ? ` من ${pageCount} في هذه الصفحة` : ""}
        </p>
        <button
          type="button"
          onClick={onClear}
          disabled={count === 0 || busy}
          className="rounded-2xl border border-navy/15 px-3 py-1.5 text-xs font-semibold text-navy-soft transition hover:bg-brand-soft disabled:opacity-40"
        >
          إلغاء التحديد
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72">
          <CategorySelect
            id="bulk-category"
            categories={categories}
            value={categoryId}
            onChange={(next) => setCategoryId(next ?? "")}
            label="القسم المطلوب"
          />
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={busy || count === 0}
          className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-40"
        >
          {busy ? "جارٍ التصنيف…" : `تصنيف ${count} منتج`}
        </button>
      </div>

      <p className="text-xs text-navy-soft">
        اختيار «بدون قسم» يمسح التصنيف من المنتجات المحددة. التصنيف يطبَّق على
        المنتجات المعروضة في هذه الصفحة فقط.
      </p>

      {message ? (
        <p className={`text-sm ${message.ok ? "text-success" : "text-rose-600"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}