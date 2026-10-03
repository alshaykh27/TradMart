import { z } from "zod";
// Relative specifiers (not the `@/` alias) so `node --test` can load this module
// directly — same convention as lib/admin/manual-product.ts.
import {
  CATEGORY_MAX_ICON,
  CATEGORY_MAX_NAME,
  SLUG_PATTERN,
  cleanCategoryName,
  slugifyName,
} from "../products/category.ts";
import type { TablesInsert } from "../../types/database.ts";

/**
 * Category creation rules, extracted from the route so they are unit-testable
 * without a database or a request.
 *
 * The merchant types an Arabic name; the slug is SUGGESTED from it. They may
 * override the slug, because translation is best-effort — «أدوات رياضية»
 * becomes `tools-ryadyh` and a human can do better.
 */

const nameField = z
  .string()
  .transform((value) => cleanCategoryName(value))
  .pipe(z.string().min(2, "اسم القسم مطلوب").max(CATEGORY_MAX_NAME, "اسم القسم طويل جدًا"));

const iconField = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    // An emoji is 1-2 UTF-16 code units; anything longer is a paste accident.
    if (!trimmed || trimmed.length > CATEGORY_MAX_ICON) return null;
    return trimmed;
  });

export const createCategorySchema = z.object({
  nameAr: nameField,
  slug: z
    .string()
    .optional()
    .transform((value) => (typeof value === "string" ? value.trim().toLowerCase() : "")),
  icon: iconField,
});

export type CreateCategoryOutcome =
  | { ok: true; value: { name_ar: string; slug: string; icon: string | null } }
  | { ok: false; error: string };

export function buildCategory(body: unknown): CreateCategoryOutcome {
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  const { nameAr, slug, icon } = parsed.data;

  // An explicit slug wins, but it still has to satisfy the DB CHECK constraint —
  // otherwise the insert fails with a constraint error the merchant cannot act on.
  let resolved = slug;
  if (!resolved) {
    resolved = slugifyName(nameAr) ?? "";
  }

  if (!resolved) {
    return {
      ok: false,
      error: "تعذّر اشتقاق رابط للقسم — اكتب الرابط يدويًا (أحرف إنجليزية صغيرة فقط)",
    };
  }

  if (!SLUG_PATTERN.test(resolved)) {
    return {
      ok: false,
      error: "الرابط يجب أن يكون أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط، مثل: home-kitchen",
    };
  }

  return {
    ok: true,
    value: { name_ar: nameAr, slug: resolved.slice(0, 60), icon },
  };
}

/** Insert row for a new category. display_order is assigned by the route. */
export function buildCategoryRow(
  input: { name_ar: string; slug: string; icon: string | null },
  displayOrder: number,
): TablesInsert<"categories"> {
  return {
    name_ar: input.name_ar,
    slug: input.slug,
    icon: input.icon,
    display_order: displayOrder,
  };
}
