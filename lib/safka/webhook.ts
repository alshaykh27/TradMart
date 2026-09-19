/**
 * Defensive parser for Safka "Product Hook" webhook payloads.
 *
 * Safka's official docs live inside the merchant dashboard and are not
 * publicly fetchable, so this maps the payload leniently: any of several
 * common key names per field, plus a scan of `properties` for cost /
 * commission / stock when Safka sends them as key/value properties. Numbers
 * are coerced and clamped; only http(s) image URLs are kept. The route
 * handler sanitizes the description before it is stored or rendered.
 */

export type NormalizedProductHook = {
  safka_product_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  cost_price: number | null;
  commission: number | null;
  stock: number;
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

function firstImage(value: unknown): string | null {
  const urls = Array.isArray(value) ? value : [value];
  for (const item of urls) {
    const url = firstText(item, ["url", "src", "image"]);
    if (url && /^https?:\/\/.+/.test(url)) return url;
  }
  return null;
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

export function normalizeProductHook(payload: unknown): NormalizedProductHook | null {
  if (!isRecordish(payload)) return null;
  const source = isRecordish(payload.product) ? (payload.product as Recordish) : payload;

  const id = firstText(source, ["id", "code", "_id", "product_id", "productId", "sku", "sku_code"]);
  if (!id) return null;

  const name = firstText(source, ["name", "title", "product_name"]) ?? "Safka product";
  const description = firstText(source, ["description", "details", "full_description"]);

  const image_url = firstImage(pick(source, ["images", "image", "main_image", "media_url", "thumbnail"]));

  const cost = toAmount(
    pick(source, ["cost_price", "costPrice", "purchase_price", "purchasePrice", "original_price", "originalPrice", "cost"]) ??
      fromProperties(source, ["cost", "purchase", "original"]),
  );
  const commission = toAmount(
    pick(source, ["commission", "commission_amount", "commissionAmount", "referral_fee", "referralFee"]) ??
      fromProperties(source, ["commission", "referral"]),
  );
  const suggested = toAmount(
    pick(source, ["sale_price", "salePrice", "suggested_price", "suggestedPrice", "selling_price", "price", "list_price"]),
  );
  const stock = toStock(
    pick(source, ["stock", "quantity", "available_quantity", "availableQuantity", "in_stock", "remaining"]) ??
      fromProperties(source, ["stock", "quantity"]),
  );

  let price: number;
  if (cost !== null && commission !== null) price = cost + commission;
  else if (suggested !== null) price = suggested;
  else if (cost !== null) price = cost;
  else if (commission !== null) price = commission;
  else price = 0;

  return {
    safka_product_id: id.slice(0, 200),
    name: name.slice(0, 500),
    description,
    image_url,
    price: clampAmount(Math.max(0, price)),
    cost_price: cost === null ? null : clampAmount(cost),
    commission: commission === null ? null : clampAmount(commission),
    stock,
  };
}