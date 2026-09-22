import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSafkaOrdersEnabled, sendSafkaOrder } from "@/lib/safka/orders";
import { resolveSafkaPropertyId } from "@/lib/safka/order-payload";

/**
 * POST /api/admin/orders/[id]/safka — deliberately-manual forwarding of ONE
 * order to Safka, using the exact same payload builder as the checkout.
 *
 * Safety rails:
 *   - the action only exists when SAFKA_ORDERS_ENABLED === "true" (gate
 *     re-checked here, never trusted from the client)
 *   - never automatic: the merchant clicks the button per order
 *   - on success the returned Safka order id is stored on our order row
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  if (!isSafkaOrdersEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "الإرسال إلى سافكا معطّل — فعِّل SAFKA_ORDERS_ENABLED=true ثم أعد المحاولة",
      },
      { status: 409 },
    );
  }

  const { id } = await context.params;
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      "id, customer_name, phone, address, city, shipping_governorate, subtotal, safka_order_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (orderError || !order || !order.shipping_governorate) {
    return NextResponse.json(
      { ok: false, error: "الطلب غير موجود أو بلا محافظة إرسال" },
      { status: 404 },
    );
  }

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", id)
    .order("id");

  if (itemsError || !items || items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "الطلب بلا عناصر" },
      { status: 422 },
    );
  }

  const productIds = [
    ...new Set(
      items
        .map((item) => item.product_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id, name, safka_product_id, commission, variants")
    .in("id", productIds);

  if (productsError || !products) {
    return NextResponse.json(
      { ok: false, error: "تعذّر تحميل المنتجات" },
      { status: 502 },
    );
  }

  const productById = new Map(products.map((product) => [product.id, product]));

  const lines = items.map((item) => {
    const product = item.product_id ? productById.get(item.product_id) : undefined;
    return {
      safkaProductId: product?.safka_product_id ?? null,
      safkaPropertyId: resolveSafkaPropertyId(product?.variants),
      quantity: item.quantity,
      commission: product?.commission == null ? null : Number(product.commission),
    };
  });

  const outcome = await sendSafkaOrder(
    {
      clientName: order.customer_name,
      phone: order.phone,
      address: order.address,
      city: order.city,
      shippingGovernorate: order.shipping_governorate,
      total: Number(order.subtotal),
      note: "",
      lines,
    },
    { mode: "admin" },
  );

  // Only a successful, acknowledged send is recorded; a failed one leaves the
  // order untouched (status stays pending) so the merchant can retry.
  if (outcome.sent && outcome.safkaOrderId) {
    await admin
      .from("orders")
      .update({ safka_order_id: outcome.safkaOrderId })
      .eq("id", id);
  }

  return NextResponse.json(
    {
      ok: outcome.sent,
      safkaOrderId: outcome.sent ? outcome.safkaOrderId : null,
      safkaStatus: outcome.safkaStatus,
      httpStatus: outcome.httpStatus,
      response: outcome.response,
      payload: outcome.payload,
      warnings: outcome.warnings,
      error: outcome.sent ? undefined : outcome.error,
    },
    { status: outcome.sent ? 200 : 502 },
  );
}