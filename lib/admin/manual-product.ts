import { z } from "zod";
// Relative specifiers (not the `@/` alias) so `node --test` can load this module
// directly — same convention as lib/orders/lines.ts -> ./pricing.ts.
import { displayPrice, round2 } from "../products/pricing.ts";
import {
  cleanText,
  MANUAL_MAX_COMMISSION,
  MANUAL_MAX_COST,
  MANUAL_MAX_DESCRIPTION,
  MANUAL_MAX_NAME,
  MANUAL_MAX_STOCK,
  parseImageInput,
  type ParsedImages,
} from "../products/manual.ts";
import type { Json, TablesInsert, TablesUpdate } from "../../types/database.ts";
import { isUuid } from "../products/category.ts";

/**
 * Request validation and row building for manually-added products
 * (source = 'manual'), extracted from the admin routes so the rules are
 * unit-testable without a database or a request.
 *
 * Pricing rule: the storefront shows `price`, and for a manual product that is
 * always derived as cost_price + commission. The browser may not send a price —
 * the server computes it, exactly as checkout recomputes order lines from the
 * database rather than from the cart.
 *
 * Field-level constants and image parsing live in lib/products/manual.ts so the
 * admin form can share them without pulling zod into the browser bundle.
 */

const nameField = z
  .string()
  .transform((value) => cleanText(value))
  .pipe(z.string().min(2, "اسم المنتج مطلوب").max(MANUAL_MAX_NAME, "اسم المنتج طويل جدًا"));

const descriptionField = z
  .string()
  .optional()
  .transform((value) => (value ? cleanText(value) : ""))
  .pipe(z.string().max(MANUAL_MAX_DESCRIPTION, "الوصف طويل جدًا"));

/**
 * Explicit truthy coercion rather than z.coerce.boolean(), because
 * Boolean("false") === true — a plain coerce would silently publish a product
 * the merchant just unpublished.
 */
const booleanField = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((value) =>
    typeof value === "boolean" ? value : value === 1 || value === "1" || value === "true",
  );

const money = (max: number) =>
  z.coerce
    .number()
    .finite("قيمة رقمية مطلوبة")
    .min(0, "لا يمكن أن تكون سالبة")
    .max(max, "قيمة أكبر من الحد المسموح");

/**
 * A manual product may belong to zero or one category.
 *
 * The admin dropdown's "no category" option sends an empty string, and an
 * omitted field means "leave it alone" on the editor — both normalise to null,
 * which is the column's "not categorised yet" value. An id that is not a UUID
 * is rejected rather than passed on, so a stale client cannot trigger an opaque
 * foreign-key error.
 */
const categoryField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value): string | null => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed === "" ? null : trimmed;
  })
  .refine((value) => value === null || isUuid(value), "القسم المحدد غير صالح");

export const manualProductSchema = z.object({
  name: nameField,
  description: descriptionField,
  images: z.unknown(),
  costPrice: money(MANUAL_MAX_COST),
  commission: money(MANUAL_MAX_COMMISSION),
  stock: z.coerce
    .number()
    .int("مخزون غير صحيح")
    .min(0, "لا يمكن أن يكون سالبًا")
    .max(MANUAL_MAX_STOCK, "مخزون أكبر من الحد المسموح"),
  isPublished: booleanField,
  categoryId: categoryField,
});

export type ManualProductInput = z.infer<typeof manualProductSchema>;

export type ManualProductOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Builds the insert row for a new manual product. `descriptionHtml` is the
 * already-sanitized HTML (lib/sanitize.ts); the route sanitizes once, here we
 * only place it, so the pure module stays free of the sanitizer dependency.
 */
export function buildManualProductRow(
  input: ManualProductInput,
  descriptionHtml: string | null,
  parsedImages: ParsedImages,
): TablesInsert<"products"> {
  const costPrice = round2(input.costPrice);

  return {
    // A manual product has no Safka counterpart: null keeps the Safka writers
    // (which filter on source) and the order-forwarding payload honest.
    safka_product_id: null,
    barcode: null,
    source: "manual",
    name: input.name,
    description: descriptionHtml,
    price: displayPrice(costPrice, input.commission),
    cost_price: costPrice,
    commission: round2(input.commission),
    stock: input.stock,
    status: "active",
    is_published: input.isPublished,
    // null = not categorised yet; the merchant can assign one later.
    category_id: input.categoryId,
    image_url: parsedImages.urls[0] ?? null,
    images: parsedImages.urls.length > 0 ? (parsedImages.urls as Json) : null,
  };
}

/** Validates + builds the insert row in one step (Arabic error messages). */
export function buildManualProduct(
  body: unknown,
  sanitize: (value: string) => string,
): ManualProductOutcome<TablesInsert<"products">> {
  const parsed = manualProductSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  const images = parseImageInput(parsed.data.images);
  if (!images.ok) return { ok: false, error: images.error };

  const description = parsed.data.description;
  return {
    ok: true,
    value: buildManualProductRow(parsed.data, description ? sanitize(description) : null, images.images),
  };
}

/** Builds the update row for editing an existing manual product. */
export function buildManualProductPatch(
  body: unknown,
  sanitize: (value: string) => string,
): ManualProductOutcome<TablesUpdate<"products">> {
  const parsed = manualProductSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  const images = parseImageInput(parsed.data.images);
  if (!images.ok) return { ok: false, error: images.error };

  const description = parsed.data.description;
  const costPrice = round2(parsed.data.costPrice);

  return {
    ok: true,
    value: {
      name: parsed.data.name,
      description: description ? sanitize(description) : null,
      price: displayPrice(costPrice, parsed.data.commission),
      cost_price: costPrice,
      commission: round2(parsed.data.commission),
      stock: parsed.data.stock,
      is_published: parsed.data.isPublished,
      // Always written, not only when present: the full editor submits the whole
      // form, so clearing the dropdown must be able to clear the column.
      category_id: parsed.data.categoryId,
      image_url: images.images.urls[0] ?? null,
      images: images.images.urls.length > 0 ? (images.images.urls as Json) : null,
    },
  };
}