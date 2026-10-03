"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Delete button for a MANUALLY-ADDED product, shared by the row action in
 * /admin/products and the edit panel so both behave identically.
 *
 * Only ever rendered for source = 'manual'. The server enforces that too:
 * DELETE /api/admin/products/manual/[id] reloads the row and refuses anything
 * whose source is not 'manual' (409), so a Safka product cannot be deleted even
 * if this button were somehow mounted for one.
 *
 * Deleting also removes the product's uploaded objects from the
 * `product-images` bucket (handled server-side, best-effort), so no orphaned
 * files are left behind. Pasted external image URLs are left untouched — they
 * are not ours to delete.
 *
 * Two-step confirmation: «حذف المنتج» reveals the confirm panel, and only then
 * does the destructive call fire.
 */
export default function DeleteManualProductButton({
  productId,
  productName,
  size = "md",
  onDeleted,
}: {
  productId: string;
  productName: string;
  size?: "sm" | "md";
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trigger =
    size === "sm"
      ? "rounded-2xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
      : "rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50";

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/manual/${productId}`, {
        method: "DELETE",
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        deletedImages?: number;
      };

      if (!response.ok || !json.ok) {
        setError(json?.error ?? "تعذّر حذف المنتج");
        setBusy(false);
        return;
      }

      setConfirming(false);
      onDeleted?.();

      // Carry the success message in the URL so it survives the server
      // re-render: the row that owned this button is about to disappear, so
      // local component state could not show it. Existing list filters are
      // preserved. Read at click time (never during render) so no
      // useSearchParams/Suspense boundary is needed.
      const params = new URLSearchParams(window.location.search);
      params.set("deleted", productName);
      router.replace(`/admin/products?${params.toString()}`);

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className={trigger}
        >
          حذف المنتج
        </button>
        {error ? <p className="mt-1.5 text-xs text-rose-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-rose-50 p-4">
      <p className="text-sm font-bold text-rose-700">هل أنت متأكد من حذف هذا المنتج؟</p>
      <p className="text-sm text-rose-700">
        سيُحذف «{productName}» نهائيًا مع صوره المرفوعة، ولا يمكن التراجع عن ذلك.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-40"
        >
          {busy ? "جارٍ الحذف…" : "نعم، احذف المنتج"}
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