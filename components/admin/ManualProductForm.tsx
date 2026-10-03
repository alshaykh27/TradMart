"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { displayPrice } from "@/lib/products/pricing";
import {
  ALLOWED_IMAGE_TYPES,
  MANUAL_MAX_IMAGES,
  MAX_IMAGE_BYTES,
} from "@/lib/products/manual";
import CategorySelect from "./CategorySelect";
import type { CategoryOption } from "@/lib/products/category";

/**
 * Create/edit form for a manually-added product.
 *
 * The merchant supplies name, description, images, cost, commission, stock, the
 * publish toggle and the category. The storefront price is derived — cost +
 * commission — and is shown live here as a preview only; the server recomputes it.
 */
export type ManualProductValues = {
  name: string;
  description: string;
  images: string;
  costPrice: string;
  commission: string;
  stock: string;
  isPublished: boolean;
  categoryId: string;
};

export type ManualProductSeed = {
  name: string;
  description: string | null;
  images: string[] | null;
  image_url: string | null;
  cost_price: number | null;
  commission: number | null;
  stock: number;
  is_published: boolean;
  category_id?: string | null;
};

const EMPTY: ManualProductValues = {
  name: "",
  description: "",
  images: "",
  costPrice: "",
  commission: "",
  stock: "0",
  isPublished: false,
  categoryId: "",
};

function seedValues(seed: ManualProductSeed | null): ManualProductValues {
  if (!seed) return EMPTY;
  const urls = [
    ...new Set([seed.image_url, ...(Array.isArray(seed.images) ? (seed.images as string[]) : [])].filter((url): url is string => typeof url === "string" && url.length > 0)),
  ];
  return {
    name: seed.name,
    description: seed.description ?? "",
    images: urls.join("\n"),
    costPrice: seed.cost_price == null ? "" : String(seed.cost_price),
    commission: seed.commission == null ? "" : String(seed.commission),
    stock: String(seed.stock),
    isPublished: seed.is_published,
    categoryId: seed.category_id ?? "",
  };
}

function toNumber(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

const FIELD =
  "w-full rounded-2xl border border-navy/15 bg-white px-4 py-2.5 text-sm text-navy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";
const LABEL = "block text-sm font-semibold text-navy-soft";

export default function ManualProductForm({
  mode,
  productId,
  seed,
  categories = [],
  onDone,
}: {
  mode: "create" | "edit";
  productId?: string;
  seed?: ManualProductSeed | null;
  categories?: CategoryOption[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<ManualProductValues>(() => seedValues(seed ?? null));
  const [busy, setBusy] = useState<"save" | "upload" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);

  const previewPrice = displayPrice(toNumber(values.costPrice), toNumber(values.commission));
  const imageCount = values.images
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;

  function update<K extends keyof ManualProductValues>(
    key: K,
    value: ManualProductValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function uploadFile(file: File) {
    setBusy("upload");
    setMessage(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/products/manual/upload", {
        method: "POST",
        body: form,
      });
      const json = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !json.url) {
        setMessage({ text: json?.error ?? "تعذّر رفع الصورة", ok: false });
        return;
      }
      const lines = values.images.split("\n").map((line) => line.trim()).filter(Boolean);
      update("images", [...lines, json.url].join("\n"));
      setMessage({ text: "تم رفع الصورة", ok: true });
    } catch {
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setBusy(null);
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit() {
    setBusy("save");
    setMessage(null);
    try {
      const response = await fetch(
        mode === "create" ? "/api/admin/products/manual" : `/api/admin/products/manual/${productId}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage({ text: json?.error ?? "تعذّر الحفظ", ok: false });
        return;
      }
      setMessage({
        text: mode === "create" ? "تمت إضافة المنتج" : "تم حفظ التعديلات",
        ok: true,
      });
      if (mode === "create") setValues(EMPTY);
      router.refresh();
      onDone?.();
    } catch {
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={LABEL} htmlFor="manual-name">
          اسم المنتج
        </label>
        <input
          id="manual-name"
          type="text"
          value={values.name}
          onChange={(event) => update("name", event.target.value)}
          className={`${FIELD} mt-1.5`}
          placeholder="مثال: شاي أحمر ١٠٠ جرام"
          maxLength={200}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="manual-description">
          الوصف
        </label>
        <textarea
          id="manual-description"
          value={values.description}
          onChange={(event) => update("description", event.target.value)}
          rows={4}
          className={`${FIELD} mt-1.5 resize-y`}
          placeholder="اكتب وصف المنتج…"
        />
      </div>

      <div className="rounded-2xl border border-navy/10 bg-slate-50/60 p-3">
        <CategorySelect
          id="manual-category"
          categories={categories}
          value={values.categoryId}
          onChange={(categoryId) => update("categoryId", categoryId ?? "")}
          hint="يظهر القسم في المتجر كفلتر للزوار. يمكنك إنشاء قسم جديد الآن."
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="manual-images">
          روابط الصور (رابط في كل سطر)
        </label>
        <textarea
          id="manual-images"
          value={values.images}
          onChange={(event) => update("images", event.target.value)}
          rows={3}
          dir="ltr"
          className={`${FIELD} mt-1.5 resize-y font-mono text-xs`}
          placeholder="https://example.com/image.jpg"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={Object.keys(ALLOWED_IMAGE_TYPES).join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy === "upload" || imageCount >= MANUAL_MAX_IMAGES}
            className="rounded-2xl border border-navy/15 px-4 py-2 text-sm font-semibold text-navy-soft transition hover:bg-brand-soft disabled:opacity-40"
          >
            {uploading ? "جارٍ الرفع…" : "رفع صورة من الجهاز"}
          </button>
          <span className="text-xs text-navy-soft">
            {imageCount}/{MANUAL_MAX_IMAGES} · حتى {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} م.ب
            · تُحفظ روابط الصور المرفوعة على رابط عام
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="manual-cost">
            سعر التكلفة
          </label>
          <div className="mt-1.5 flex items-center gap-1 rounded-2xl border border-navy/15 bg-white px-4 py-2.5 focus-within:border-brand">
            <input
              id="manual-cost"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={values.costPrice}
              onChange={(event) => update("costPrice", event.target.value)}
              className="w-full bg-transparent text-sm text-navy outline-none"
              placeholder="0"
            />
            <span className="text-xs text-navy-soft">ج.م</span>
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="manual-commission">
            العمولة
          </label>
          <div className="mt-1.5 flex items-center gap-1 rounded-2xl border border-navy/15 bg-white px-4 py-2.5 focus-within:border-brand">
            <input
              id="manual-commission"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={values.commission}
              onChange={(event) => update("commission", event.target.value)}
              className="w-full bg-transparent text-sm text-navy outline-none"
              placeholder="0"
            />
            <span className="text-xs text-navy-soft">ج.م</span>
          </div>
        </div>
      </div>

      <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm text-navy">
        سعر العرض للعميل = التكلفة + العمولة · المعروض الآن:{" "}
        <span className="font-extrabold text-brand">
          {previewPrice.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م
        </span>
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-40">
          <label className={LABEL} htmlFor="manual-stock">
            المخزون
          </label>
          <input
            id="manual-stock"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={values.stock}
            onChange={(event) => update("stock", event.target.value)}
            className={`${FIELD} mt-1.5`}
          />
        </div>

        <label className="flex items-center gap-2 pb-2.5 text-sm font-semibold text-navy">
          <input
            type="checkbox"
            checked={values.isPublished}
            onChange={(event) => update("isPublished", event.target.checked)}
            className="size-4 accent-brand"
          />
          منشور في المتجر
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy !== null}
          className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-40"
        >
          {busy === "save" ? "جارٍ الحفظ…" : mode === "create" ? "إضافة المنتج" : "حفظ التعديلات"}
        </button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            disabled={busy !== null}
            className="rounded-2xl border border-navy/15 px-4 py-2.5 text-sm text-navy-soft transition hover:bg-brand-soft disabled:opacity-50"
          >
            إغلاق
          </button>
        ) : null}
        {message ? (
          <p className={`text-sm ${message.ok ? "text-success" : "text-rose-600"}`}>
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}