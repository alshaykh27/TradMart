"use client";
import { useState } from "react";
import ManualProductForm from "./ManualProductForm";
import type { CategoryOption } from "@/lib/products/category";

/**
 * Collapsible "add a product by hand" panel at the top of /admin/products.
 * Collapsed by default so the synced list stays the focus.
 */
export default function AddManualProduct({
  categories = [],
}: {
  categories?: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="rounded-3xl bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-navy">إضافة منتج يدويًا</h2>
            <p className="text-sm text-navy-soft">
              منتج تسجّله بنفسك بدون سافكا. سعر العرض يُحسب تلقائيًا = التكلفة +
              العمولة، ولن تلمسه مزامنة سافكا أبدًا.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
          >
            + منتج جديد
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 shadow-soft">
      <h2 className="font-bold text-navy">إضافة منتج يدويًا</h2>
      <ManualProductForm mode="create" categories={categories} onDone={() => setOpen(false)} />
    </section>
  );
}