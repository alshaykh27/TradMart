"use client";
import { useState } from "react";
import ProductRow, { type AdminProduct } from "./ProductRow";
import BulkCategoriseBar from "./BulkCategoriseBar";
import type { CategoryOption } from "@/lib/products/category";

/**
 * The admin product list plus its bulk-categorisation mode.
 *
 * This is a Client Component because selection is interactive state. It receives
 * exactly one page of products from the server and can only ever act on the rows
 * it is holding — the selection can never silently span pages it did not render.
 */
export default function AdminProductList({
  products,
  categories,
}: {
  products: AdminProduct[];
  categories: CategoryOption[];
}) {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selected = new Set(selectedIds);

  function toggle(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function toggleAll() {
    setSelectedIds((ids) =>
      ids.length === products.length ? [] : products.map((product) => product.id),
    );
  }

  const allSelected = products.length > 0 && selectedIds.length === products.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setBulkMode((value) => !value);
            setSelectedIds([]);
          }}
          className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
            bulkMode
              ? "bg-navy text-white hover:bg-navy-soft"
              : "border border-navy/15 text-navy-soft hover:bg-brand-soft"
          }`}
        >
          {bulkMode ? "إنهاء التصنيف الجماعي" : "تصنيف جماعي"}
        </button>

        {bulkMode ? (
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-2xl border border-navy/15 px-4 py-2 text-sm font-semibold text-navy-soft transition hover:bg-brand-soft"
          >
            {allSelected ? "إلغاء تحديد الكل" : "تحديد كل المنتجات في هذه الصفحة"}
          </button>
        ) : null}
      </div>

      {bulkMode ? (
        <BulkCategoriseBar
          categories={categories}
          selectedIds={selectedIds}
          pageCount={products.length}
          onClear={() => setSelectedIds([])}
        />
      ) : null}

      <ul className="space-y-3">
        {products.map((product) => (
          <li key={product.id}>
            <ProductRow
              product={product}
              categories={categories}
              bulkMode={bulkMode}
              selected={selected.has(product.id)}
              onToggle={toggle}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}