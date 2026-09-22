import "server-only";
import type { TablesInsert } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShippingSettings } from "@/lib/settings";
import { computeOrderTotals, roundMoney } from "./pricing";
import { buildOrderLines, OrderValidationError } from "./lines";
import { resolveSafkaPropertyId } from "@/lib/safka/order-payload";
import { sendSafkaOrder } from "@/lib/safka/orders";
import { sendNewOrderTelegramAlert } from "@/lib/notify/telegram";
import type { SafkaOrderLineInput } from "@/lib/safka/order-payload";

export { OrderValidationError } from "./lines";

/**
 * Server-side order creation for the cash-on-delivery checkout.
 *
 * The browser never sends a price: the server looks every product up in
 * Supabase, re-computes the subtotal from current DB prices, reads the
 * per-governorate shipping fee from `governorate_pricing` (+ the optional
 * markup from `settings`), and only then writes the order + order_items rows
 * through the service-role client (anon has no policies on orders/order_items).
 *
 * `shippingGovernorate` is the Safka price-list (pricing) document `_id` the
 * customer chose; it is ALSO stored on the order so it can be forwarded
 * verbatim to Safka when order sending is enabled.
 */

export type OrderItemInput = {
  productId: string;
  qty: number;
};

export type CreateOrderInput = {
  customerName: string;
  phone: string;
  country: string;
  city: string;
  /** Safka price-list document _id (governorate_pricing.governorate_id). */
  shippingGovernorate: string;
  address: string;
  items: OrderItemInput[];
};

export type CreateOrderResult = {
  orderId: string;
  subtotal: number;
  shippingFee: number;
  total: number;
};

/** Validation failures map to 422 in the route handler. */
const MAX_ITEMS = 50;
const MAX_QTY = 99;
const MAX_FIELD_LENGTH = 300;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function validateRequired(value: string, label: string, max = MAX_FIELD_LENGTH): string {
  const cleaned = clean(value);
  if (!cleaned) {
    throw new OrderValidationError(`${label} is required`);
  }
  if (cleaned.length > max) {
    throw new OrderValidationError(`${label} is too long`);
  }
  return cleaned;
}

function validatePhone(phone: string): string {
  const cleaned = clean(phone);
  if (!/^[+0-9][0-9()\s-]{5,20}$/.test(cleaned)) {
    throw new OrderValidationError("A valid phone number is required");
  }
  return cleaned;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const customerName = validateRequired(input.customerName, "customer name");
  const phone = validatePhone(input.phone);
  const country = validateRequired(input.country, "country", 80);
  const city = validateRequired(input.city, "city", 120);
  const shippingGovernorate = validateRequired(
    input.shippingGovernorate,
    "governorate",
    120,
  );
  const address = validateRequired(input.address, "address");

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new OrderValidationError("Cart is empty");
  }
  if (input.items.length > MAX_ITEMS) {
    throw new OrderValidationError("Too many products in cart");
  }

  const requested: { productId: string; qty: number }[] = input.items
    .map((item) => ({
      productId: String(item.productId ?? "").trim(),
      qty: Math.trunc(Number(item.qty)),
    }))
    .filter((item) => item.productId.length > 0 && item.qty > 0);

  if (requested.length === 0) {
    throw new OrderValidationError("Cart is empty");
  }
  if (requested.some((item) => item.qty > MAX_QTY)) {
    throw new OrderValidationError("Quantity is too high");
  }

  // Deduplicate (last quantity wins, like the client cart does on add).
  const unique = new Map<string, number>();
  for (const item of requested) {
    unique.set(item.productId, item.qty);
  }

  const ids = [...unique.keys()];

  const admin = createAdminClient();

  // The chosen id must be in the synced Safka price list; if it is not, this
  // order has no valid shipping fee and must be rejected.
  const { data: governorateRow, error: governorateError } = await admin
    .from("governorate_pricing")
    .select("governorate_id, name_ar, safka_shipping_fee")
    .eq("governorate_id", shippingGovernorate)
    .maybeSingle();

  if (governorateError || !governorateRow) {
    throw new OrderValidationError("Unsupported governorate");
  }
  const governorateName = governorateRow.name_ar;
  const shippingSettings = await getShippingSettings();
  const shippingFee = roundMoney(
    Number(governorateRow.safka_shipping_fee) +
      Number(shippingSettings.shippingMarkup),
  );

  const { data: products, error } = await admin
    .from("products")
    .select(
      "id, name, price, stock, is_published, status, safka_product_id, commission, variants",
    )
    .in("id", ids);

  if (error) {
    throw new Error("Could not load products");
  }

  const { rows, subtotal } = buildOrderLines(unique, products ?? []);

  const totals = computeOrderTotals(subtotal, shippingFee);

  const orderRow: TablesInsert<"orders"> = {
    customer_name: customerName,
    phone,
    country,
    city,
    governorate: governorateName,
    shipping_governorate: shippingGovernorate,
    address,
    subtotal: totals.subtotal,
    shipping_fee: totals.shippingFee,
    total: totals.total,
    status: "pending",
  };

  const { data: created, error: orderError } = await admin
    .from("orders")
    .insert(orderRow)
    .select("id")
    .single();

  if (orderError || !created?.id) {
    throw new Error("Could not create order");
  }

  const orderId = created.id;

  const itemRows = rows.map((row) => ({ ...row, order_id: orderId }));
  const { error: itemsError } = await admin.from("order_items").insert(itemRows);

  if (itemsError) {
    // The order is already persisted; items failed is an internal problem.
    throw new Error("Could not save order items");
  }

  // New-order alert (Telegram) so the merchant knows to open /admin and send
  // this order to Safka manually. Best-effort — never fails the checkout, and
  // skipped (with a log) when Telegram is not configured.
  try {
    await sendNewOrderTelegramAlert({
      orderId,
      customerName,
      phone,
      governorate: governorateName,
      city,
      total: totals.total,
    });
  } catch {
    // Alerts are best-effort; the local order is already persisted.
  }

  // Best-effort forwarding to Safka. The checkout path (mode "checkout") is
  // deliberately gated on BOTH SAFKA_ORDERS_ENABLED and SAFKA_AUTO_FORWARD, so
  // enabling the admin's manual "إرسال إلى سافكا" button can never cause
  // automatic sends. Never fails the local order; when not allowed, the exact
  // payload that would be sent is logged (no secrets).
  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const safkaLines: SafkaOrderLineInput[] = rows.map((row) => {
    const product = productById.get(row.product_id);
    return {
      safkaProductId: product?.safka_product_id ?? null,
      safkaPropertyId: resolveSafkaPropertyId(product?.variants),
      quantity: row.quantity,
      commission: product?.commission == null ? null : Number(product.commission),
    };
  });

  try {
    const outcome = await sendSafkaOrder(
      {
        clientName: customerName,
        phone,
        address,
        city,
        shippingGovernorate,
        total: totals.subtotal,
        note: "",
        lines: safkaLines,
      },
      { mode: "checkout" },
    );
    if (outcome.sent && outcome.safkaOrderId) {
      await admin
        .from("orders")
        .update({ safka_order_id: outcome.safkaOrderId })
        .eq("id", orderId);
    }
  } catch {
    // Safka is best-effort; the local order is already persisted.
  }

  return {
    orderId,
    subtotal: totals.subtotal,
    shippingFee: totals.shippingFee,
    total: totals.total,
  };
}