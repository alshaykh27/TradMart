"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import CategorySelect from "./CategorySelect";
import type { CategoryOption } from "@/lib/products/category";

/**
 * Sticky action bar for the products the merchant has selected by hand.
 *
 * Selection is scoped to the rows currently on screen (at most one page, 50
 * rows), which keeps the state honest — no hidden ids accumulated across pages,
 * and the count always matches what the merchant can see.
 *
 * There is deliberately no "publish everything" or "apply to this whole filter"
 * control. Publication is customer-facing, so it is always an explicit,
 * hand-picked id list plus a second confirming click. The server enforces the
 * id-list half (see /api/admin/products/bulk); this component supplies the
 * deliberate half.
 *
 * Exactly one action is sent per request — the bar clears the category select
 * before a publish request so a section can never ride along with it.
 */
export default function BulkActionsBar({
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
  /** null = idle, otherwise the publish action awaiting its second click. */
  const [confirming, setConfirming] = useState<"publish" | "unpublish" | null>(null);

  const count = selectedIds.length;

  async function send(body: Record<string, unknown>, busyLabel: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, ...body }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        updated?: number;
        error?: string;
      };
      if (!response.ok) {
        setMessage({ text: json?.error ?? "تعذّر تطبيق الإجراء", ok: false });
        return;
      }
      setMessage({ text: `${busyLabel} ${json.updated ?? count} منتجًا`, ok: true });
      // Disarm only on success, so a failed request leaves the confirm panel
      // open and the merchant can retry without re-arming it.
      setConfirming(null);
      onClear();
      router.refresh();
    } catch {
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setBusy(false);
    }
  }

  function categorise() {
    if (count === 0) {
      setMessage({ text: "اختر منتجًا واحدًا على الأقل", ok: false });
      return;
    }
    void send({ category_id: categoryId === "" ? null : categoryId }, "تم تصنيف");
  }

  function runPublish(action: "publish" | "unpublish") {
    void send(
      { is_published: action === "publish" },
      action === "publish" ? "تم نشر" : "تم إلغاء نشر",
    );
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
          onClick={categorise}
          disabled={busy || count === 0}
          className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-40"
        >
          {busy ? "جارٍ التصنيف…" : `تصنيف ${count} منتج`}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-navy/10 pt-3">
        <p className="text-sm font-semibold text-navy-soft">حالة النشر:</p>
        <button
          type="button"
          onClick={() => setConfirming("publish")}
          disabled={busy || count === 0 || confirming !== null}
          className="rounded-2xl bg-success px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          نشر {count} منتج
        </button>
        <button
          type="button"
          onClick={() => setConfirming("unpublish")}
          disabled={busy || count === 0 || confirming !== null}
          className="rounded-2xl border border-rose-200 px-5 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
        >
          إلغاء نشر {count} منتج
        </button>
      </div>

      {confirming !== null ? (
        <div className="space-y-3 rounded-2xl bg-brand-soft p-4">
          <p className="text-sm font-bold text-navy">
            {confirming === "publish"
              ? `هل تريد نشر ${count} منتجًا؟ ستظهر هذه المنتجات للزوار فورًا.`
              : `هل تريد إلغاء نشر ${count} منتجًا؟ ستختفي هذه المنتجات من المتجر فورًا.`}
          </p>
          <p className="text-xs text-navy-soft">
            سيؤثر ذلك على {count} منتجًا اخترتها يدويًا فقط.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runPublish(confirming)}
              disabled={busy}
              className={`rounded-2xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40 ${
                confirming === "publish" ? "bg-success" : "bg-rose-600"
              }`}
            >
              {busy
                ? "جارٍ التنفيذ…"
                : confirming === "publish"
                  ? "نعم، انشر المنتجات"
                  : "نعم، ألغِ النشر"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={busy}
              className="rounded-2xl border border-navy/15 px-4 py-2 text-sm text-navy-soft transition hover:bg-white disabled:opacity-50"
            >
              تراجع
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-navy-soft">
        اختيار «بدون قسم» يمسح التصنيف من المنتجات المحددة. كل الإجراءات تطبَّق على
        المنتجات التي حدّدتها في هذه الصفحة فقط، ولا يوجد إجراء يطبَّق على كل
        المنتجات أو على نتائج البحث.
      </p>

      {message ? (
        <p className={`text-sm ${message.ok ? "text-success" : "text-rose-600"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
