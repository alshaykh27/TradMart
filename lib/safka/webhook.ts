/**
 * Defensive parser for Safka "Product Hook" webhook payloads.
 *
 * Learned from a real captured payload:
 *   { "product": { "_id", "name", "barcode", "sale_price", "images[]",
 *     "image", "description", "note", "media_url", "properties[]",
 *     "is_active", "faqs", "commission" } }
 *
 * Semantics (verified against the Safka Public API getProduct):
 *   - The top-level `sale_price` in the hook = cost + merchant commission
 *     (display price). The API's own `sale_price` field returns the COST
 *     (e.g. hook 540 - commission 50 = API 490).
 *   - `properties[].value` is the available stock (no separate stock field
 *     exists in the API product shape).
 *   - `commission` is the merchant's per-unit commission.
 *   - Multiple `properties` entries are variants and are stored as JSON.
 *
 * The route handler sanitizes the description before it is stored/rendered.
 */

export type NormalizedProductHook = {
  safka_product_id: string;
  barcode: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  images: string[];
  price: number;
  cost_price: number | null;
  commission: number | null;
  stock: number;
  status: "active" | "inactive";
  variants: Record<string, string | number | boolean | null>[] | null;
  media_url: string | null;
};

const MAX_AMOUNT = 9_999_999_900;

type Recordish = Record<string, unknown>;

function isRecordish(value: unknown): value is Recordish {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(source: Recordish, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function firstText(value: unknown, keys: string[]): string | null {
  const picked = isRecordish(value) ? pick(value, keys) : value;
  if (typeof picked === "string" && picked.trim().length > 0) return picked.trim();
  if (typeof picked === "number" && Number.isFinite(picked)) return String(picked);
  return null;
}

function toAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    if (cleaned === "") return null;
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 100) / 100;
  }
  return null;
}

function clampAmount(value: number): number {
  return Math.min(Math.max(value, 0), MAX_AMOUNT);
}

function toStock(value: unknown): number {
  const amount = toAmount(value);
  if (amount === null) return 0;
  return Math.max(0, Math.trunc(amount));
}

function asUrl(value: unknown): string | null {
  const picked = isRecordish(value) ? pick(value, ["url", "src", "image"]) : value;
  const text = typeof picked === "string" ? picked.trim() : "";
  if (!text || !/^https?:\/\/.+/.test(text)) return null;
  return text;
}

function collectImages(source: Recordish): string[] {
  const out: string[] = [];
  const add = (url: string | null) => {
    if (url && !out.includes(url)) out.push(url);
  };
  const gallery = pick(source, ["images", "gallery"]);
  if (Array.isArray(gallery)) {
    for (const item of gallery) add(asUrl(item));
  } else {
    add(asUrl(gallery));
  }
  add(asUrl(pick(source, ["image", "main_image", "thumbnail"])));
  return out;
}

function fromProperties(source: Recordish, needles: string[]): unknown {
  const props = pick(source, ["properties", "variants", "options"]);
  if (!Array.isArray(props)) return undefined;
  for (const entry of props) {
    if (!isRecordish(entry)) continue;
    const key = firstText(entry, ["key", "name", "label"]);
    if (!key) continue;
    if (needles.some((needle) => key.toLowerCase().includes(needle))) {
      return pick(entry, ["value", "amount", "sale_price", "commission", "stock"]);
    }
  }
  return undefined;
}

function readProperties(source: Recordish): Recordish[] {
  const raw = pick(source, ["properties", "variants", "options"]);
  return Array.isArray(raw)
    ? (raw.filter((entry): entry is Recordish => isRecordish(entry)))
    : [];
}

export function normalizeProductHook(payload: unknown): NormalizedProductHook | null {
  if (!isRecordish(payload)) return null;
  const source = isRecordish(payload.product) ? (payload.product as Recordish) : payload;

  const barcode = firstText(source, ["barcode"]);
  const id =
    firstText(source, ["id", "code", "_id", "product_id", "productId", "sku", "sku_code"]) ??
    barcode;
  if (!id) return null;

  const name = firstText(source, ["name", "title", "product_name"]) ?? "Safka product";
  const description = firstText(source, ["description", "details", "full_description"]);
  const media_url = firstText(source, ["media_url", "mediaUrl", "drive_url"]);

  const images = collectImages(source);
  const image_url = images[0] ?? null;

  const properties = readProperties(source);
  const isActive = source.is_active !== false;

  let stock = 0;
  if (properties.length > 0) {
    for (const entry of properties) {
      if (entry.is_available !== false) stock += toStock(entry.value);
    }
  } else {
    stock = toStock(
      pick(source, ["stock", "quantity", "available_quantity", "availableQuantity", "in_stock", "remaining"]),
    );
  }
  const allPropertiesAvailable =
    properties.length === 0 || properties.some((entry) => entry.is_available !== false);

  const variants: Record<string, string | number | boolean | null>[] | null =
    properties.length > 1 ? properties.map((entry) => ({
      _id: firstText(entry, ["_id", "id"]),
      key: firstText(entry, ["key", "name", "label"]),
      value: toStock(entry.value),
      min: toAmount(entry.min),
      sale_price: toAmount(entry.sale_price),
      is_available: entry.is_available !== false,
    })) : null;

  const suggested = toAmount(
    pick(source, ["sale_price", "salePrice", "suggested_price", "suggestedPrice", "selling_price", "price", "list_price"]),
  );
  const commission = toAmount(
    pick(source, ["commission", "commission_amount", "commissionAmount", "referral_fee", "referralFee"]) ??
      fromProperties(source, ["commission", "referral"]),
  );
  const explicitCost = toAmount(
    pick(source, ["cost_price", "costPrice", "purchase_price", "purchasePrice", "original_price", "originalPrice", "cost"]) ??
      fromProperties(source, ["cost", "purchase", "original"]),
  );

  let cost: number | null;
  if (suggested !== null && commission !== null) {
    cost = Math.max(0, suggested - commission);
  } else {
    cost = explicitCost;
  }

  let price: number;
  if (cost !== null && commission !== null) price = cost + commission;
  else if (suggested !== null) price = suggested;
  else if (cost !== null) price = cost;
  else if (commission !== null) price = commission;
  else price = 0;

  return {
    safka_product_id: id.slice(0, 200),
    barcode,
    name: name.slice(0, 500),
    description,
    image_url,
    images,
    price: clampAmount(Math.max(0, price)),
    cost_price: cost === null ? null : clampAmount(cost),
    commission: commission === null ? null : clampAmount(commission),
    stock: isActive && allPropertiesAvailable ? stock : 0,
    status: isActive ? "active" : "inactive",
    variants,
    media_url,
  };
}