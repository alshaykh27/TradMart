"use client";
import ManualProductForm, { type ManualProductSeed } from "./ManualProductForm";
import DeleteManualProductButton from "./DeleteManualProductButton";
import type { CategoryOption } from "@/lib/products/category";

/**
 * Edit + delete panel for one manually-added product.
 *
 * Delete reuses the same DeleteManualProductButton as the row action, so the
 * confirmation wording and the confirm-then-delete flow are identical in both
 * places — one behaviour, one string to maintain.
 */
export default function ManualProductEditor({
  productId,
  productName,
  seed,
  categories,
  onClose,
}: {
  productId: string;
  productName: string;
  seed: ManualProductSeed;
  categories: CategoryOption[];
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl bg-brand-soft/40 p-4">
      <h3 className="font-bold text-navy">تعديل: {productName}</h3>

      <ManualProductForm
        mode="edit"
        productId={productId}
        seed={seed}
        categories={categories}
        onDone={onClose}
      />

      <div className="border-t border-navy/10 pt-4">
        <DeleteManualProductButton
          productId={productId}
          productName={productName}
          onDeleted={onClose}
        />
      </div>
    </div>
  );
}