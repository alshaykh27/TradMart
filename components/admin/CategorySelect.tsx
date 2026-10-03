"use client";
import { useMemo, useState } from "react";
import {
  CATEGORY_MAX_NAME,
  slugifyName,
  type CategoryOption,
} from "@/lib/products/category";

/**
 * Category dropdown with inline "+ new section" creation.
 *
 * Shared by the manual-product form and the per-row category field on Safka
 * products, so a section is created the same way wherever it is needed.
 *
 * Newly created sections are held in local state and merged with the
 * server-supplied list, so a full page refresh is not required for the new
 * option to appear. The list is keyed by id and de-duplicated because a later
 * router.refresh() will deliver the same category from the server too.
 */
export default function CategorySelect({
  id,
  categories,
  value,
  onChange,
  label = "القسم",
  hint,
  disabled = false,
}: {
  id: string;
  categories: CategoryOption[];
  /** Category id, or "" for "no category yet". */
  value: string;
  onChange: (categoryId: string | null) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [slugOverride, setSlugOverride] = useState("");
  const [created, setCreated] = useState<CategoryOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const options = useMemo(() => {
    const byId = new Map<string, CategoryOption>();
    for (const option of [...categories, ...created]) byId.set(option.id, option);
    return [...byId.values()].sort(
      (a, b) => a.display_order - b.display_order || a.name_ar.localeCompare(b.name_ar, "ar"),
    );
  }, [categories, created]);

  const suggestedSlug = useMemo(() => slugifyName(name), [name]);
  const effectiveSlug = slugOverride.trim().toLowerCase() || suggestedSlug || "";

  async function create() {
    if (!name.trim()) {
      setMessage({ text: "اسم القسم مطلوب", ok: false });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameAr: name,
          icon: icon.trim() || undefined,
          slug: slugOverride.trim() || undefined,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        category?: CategoryOption;
        slugAdjusted?: boolean;
        error?: string;
      };
      if (!response.ok || !json.category) {
        setMessage({ text: json?.error ?? "تعذّر إنشاء القسم", ok: false });
        return;
      }

      setCreated((list) => [...list, json.category as CategoryOption]);
      // Selecting the section immediately is what the merchant wants next: they
      // are categorising something.
      onChange(json.category.id);
      setName("");
      setIcon("");
      setSlugOverride("");
      setCreating(false);
      setMessage(
        {
          text: json.slugAdjusted
            ? `تم إنشاء القسم برابط ${json.category.slug}`
            : "تم إنشاء القسم",
          ok: true,
        },
      );
    } catch {
      setMessage({ text: "تعذّر الاتصال بالخادم", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const FIELD =
    "w-full rounded-2xl border border-navy/15 bg-white px-3 py-2.5 text-sm text-navy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-50";

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <label className="block text-sm font-semibold text-navy-soft" htmlFor={id}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => {
            setCreating((open) => !open);
            setMessage(null);
          }}
          disabled={disabled || busy}
          className="pb-1 text-xs font-semibold text-brand transition hover:text-brand-dark disabled:opacity-40"
        >
          {creating ? "إلغاء" : "+ قسم جديد"}
        </button>
      </div>

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        disabled={disabled}
        className={`${FIELD} mt-1.5`}
      >
        <option value="">بدون قسم</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.icon ? `${option.icon} ` : ""}
            {option.name_ar}
          </option>
        ))}
      </select>

      {hint ? <p className="mt-1 text-xs text-navy-soft">{hint}</p> : null}

      {creating ? (
        <div className="mt-3 space-y-2 rounded-2xl bg-brand-soft/40 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_5rem]">
            <div>
              <label className="block text-xs font-semibold text-navy-soft" htmlFor={`${id}-name`}>
                اسم القسم
              </label>
              <input
                id={`${id}-name`}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={CATEGORY_MAX_NAME}
                className={`${FIELD} mt-1`}
                placeholder="مثال: مستلزمات منزلية"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-soft" htmlFor={`${id}-icon`}>
                رمز (اختياري)
              </label>
              <input
                id={`${id}-icon`}
                type="text"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                maxLength={8}
                className={`${FIELD} mt-1 text-center`}
                placeholder="🛍"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-soft" htmlFor={`${id}-slug`}>
              رابط القسم (اختياري)
            </label>
            <input
              id={`${id}-slug`}
              type="text"
              dir="ltr"
              value={slugOverride}
              onChange={(event) => setSlugOverride(event.target.value)}
              className={`${FIELD} mt-1 font-mono text-xs`}
              placeholder={suggestedSlug ?? "home-kitchen"}
            />
            <p className="mt-1 text-xs text-navy-soft">
              {effectiveSlug
                ? `سيكون الرابط: /products?category=${effectiveSlug}`
                : "اكتب اسم القسم ليُقترح الرابط تلقائيًا (أحرف إنجليزية صغيرة فقط)"}
            </p>
          </div>

          <button
            type="button"
            onClick={create}
            disabled={busy || !name.trim()}
            className="rounded-2xl bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-soft disabled:opacity-40"
          >
            {busy ? "جارٍ الإنشاء…" : "إنشاء القسم"}
          </button>
        </div>
      ) : null}

      {message ? (
        <p className={`mt-1 text-xs ${message.ok ? "text-success" : "text-rose-600"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}