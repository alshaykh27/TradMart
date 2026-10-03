/**
 * Rules for manually-added products (source = 'manual') that both the server
 * writers and the admin Client Component need.
 *
 * Kept free of zod, Supabase and React so importing it never widens a bundle:
 * lib/admin/manual-product.ts layers the zod request schema on top, and
 * components/admin/ManualProductForm.tsx imports the constants directly.
 */

export const MANUAL_MAX_NAME = 200;
export const MANUAL_MAX_DESCRIPTION = 8000;
export const MANUAL_MAX_IMAGES = 8;
export const MANUAL_MAX_IMAGE_URL = 2000;
export const MANUAL_MAX_COST = 9_999_999;
export const MANUAL_MAX_COMMISSION = 1_000_000;
export const MANUAL_MAX_STOCK = 100_000;

/** Storage bucket for uploads; mirrors the phase 6 migration. */
export const PRODUCT_IMAGE_BUCKET = "product-images";

/** Every object the upload route writes lives under this folder. */
export const PRODUCT_IMAGE_PREFIX = "manual/";

/**
 * MIME types the upload route accepts, with the extension used for the stored
 * object name. The extension is chosen from this table, never from the
 * submitted filename, so a crafted name cannot influence the stored path.
 */
export const ALLOWED_IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export function isAllowedImageType(value: string): value is AllowedImageType {
  return Object.hasOwn(ALLOWED_IMAGE_TYPES, value);
}

/** Same bound as the bucket's file_size_limit in the phase 6 migration. */
export const MAX_IMAGE_BYTES = 5_242_880;

/** Only absolute http(s) URLs are stored; anything else is rejected. */
export function isSafeImageUrl(value: string): boolean {
  if (value.length > MANUAL_MAX_IMAGE_URL) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Strips control characters and collapses whitespace, like lib/orders/schema.ts. */
export function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ParsedImages = {
  urls: string[];
  rejected: string[];
};

export type ImageParseOutcome =
  | { ok: true; images: ParsedImages }
  | { ok: false; error: string };

/**
 * Accepts a textarea of one URL per line (the admin form's shape) or an
 * already-split array. Duplicates are collapsed preserving order; the first
 * entry becomes products.image_url.
 */
export function parseImageInput(input: unknown): ImageParseOutcome {
  const raw: string[] = Array.isArray(input)
    ? input.filter((value): value is string => typeof value === "string")
    : typeof input === "string"
      ? input.split(/[\n,]/)
      : [];

  const urls: string[] = [];
  const rejected: string[] = [];

  for (const candidate of raw) {
    const value = candidate.trim();
    if (value.length === 0) continue;
    if (!isSafeImageUrl(value)) {
      rejected.push(value.slice(0, 120));
      continue;
    }
    if (!urls.includes(value)) urls.push(value);
  }

  if (urls.length > MANUAL_MAX_IMAGES) {
    return { ok: false, error: `الحد الأقصى ${MANUAL_MAX_IMAGES} صور للمنتج الواحد` };
  }

  return { ok: true, images: { urls, rejected } };
}

/** Path segment Supabase serves public bucket objects under. */
function publicObjectPrefix(bucket: string): string {
  return `/storage/v1/object/public/${bucket}/`;
}

/**
 * Object keys for the given image URLs that live in OUR bucket, so deleting a
 * manual product can also delete the files it uploaded. Anything else (an
 * external URL, a hand-pasted image) is left alone.
 *
 * A key is returned only when the URL is under the bucket AND under our own
 * folder prefix, and the remainder is a clean relative path — no traversal, no
 * absolute paths, no backslashes.
 */
export function managedImageKeys(urls: unknown[], bucket: string): string[] {
  if (!Array.isArray(urls)) return [];
  const prefix = publicObjectPrefix(bucket);

  const keys: string[] = [];
  for (const url of urls) {
    if (typeof url !== "string") continue;
    const at = url.indexOf(prefix);
    if (at < 0) continue;

    let key: string;
    try {
      key = decodeURIComponent(url.slice(at + prefix.length));
    } catch {
      continue;
    }

    if (!key.startsWith(PRODUCT_IMAGE_PREFIX)) continue;
    if (key.includes("..") || key.includes("\\") || key.startsWith("/")) continue;

    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}