import type {
  SafkaCreateOrderRequest,
  SafkaOrderItemInput,
} from "@/types/safka";

/**
 * Pure builder for the Safka create-order payload (POST /api/v1/public/orders).
 *
 * Contract grounding — field names/types transcribed from the official docs at
 * https://public-api-docs.safka-eg.com/api/create-order:
 *   - required: client_name, client_phone1, client_address,
 *     shipping_governorate, commission, items, total
 *   - optional: client_phone2, page_name, page_id, city, note
 *   - `shipping_governorate` is the price-list (pricing) document `_id` via
 *     governorate_pricing (synced from Safka), NOT a governorate name.
 *   - `items[].product` is the Safka product `_id`; `items[].property` is a
 *     property (variant) `_id`.
 *   - `total` is the order's product total (sum of line display prices);
 *     shipping is NOT added here because the contract has no shipping amount
 *     field and Safka derives it from the governorate's price list.
 *   - `commission` is the merchant commission total (per-unit commission x qty).
 *
 * `page_id` / `page_name` are optional and omitted (we have neither).
 *
 * Kept free of "server-only"/env imports so it is unit-testable. Any field that
 * cannot be resolved from local data is surfaced as a warning rather than
 * silently invented.
 */

export type SafkaOrderLineInput = {
  safkaProductId: string | null;
  safkaPropertyId: string | null;
  quantity: number;
  commission: number | null;
};

export type SafkaOrderInput = {
  clientName: string;
  phone: string;
  /** Street address only — city/governorate go in their own fields. */
  address: string;
  city: string;
  /** Safka price-list document `_id` (already resolved from the order). */
  shippingGovernorate: string | null;
  /** Product total (subtotal), excluding shipping. */
  total: number;
  note: string;
  lines: SafkaOrderLineInput[];
};

export type SafkaOrderPayload = {
  payload: SafkaCreateOrderRequest;
  warnings: string[];
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Reads the Safka property (variant) `_id` stored in products.variants. */
export function resolveSafkaPropertyId(variants: unknown): string | null {
  if (!Array.isArray(variants)) return null;
  for (const variant of variants) {
    if (variant && typeof variant === "object" && !Array.isArray(variant)) {
      const id = (variant as Record<string, unknown>)._id;
      if (typeof id === "string" && id.trim().length > 0) return id;
    }
  }
  return null;
}

export function buildSafkaOrderPayload(input: SafkaOrderInput): SafkaOrderPayload {
  const warnings: string[] = [];
  const items: SafkaOrderItemInput[] = [];
  let commission = 0;

  if (!input.shippingGovernorate) {
    warnings.push("no Safka shipping governorate (price-list _id) is set");
  }

  for (const line of input.lines) {
    if (!line.safkaProductId) {
      warnings.push("a cart line has no Safka product id");
      continue;
    }
    if (!line.safkaPropertyId) {
      warnings.push(`product ${line.safkaProductId} has no resolved Safka property id`);
    }
    items.push({
      product: line.safkaProductId,
      property: line.safkaPropertyId ?? "",
      qty: String(line.quantity),
    });
    commission += (line.commission ?? 0) * line.quantity;
  }

  const payload: SafkaCreateOrderRequest = {
    items,
    client_name: input.clientName,
    client_phone1: input.phone,
    client_phone2: "",
    client_address: input.address.trim(),
    shipping_governorate: input.shippingGovernorate ?? "",
    commission: round2(commission),
    total: round2(input.total),
    city: input.city.trim(),
    note: input.note,
  };

  return { payload, warnings };
}