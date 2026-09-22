/**
 * TradeMart — Phase 4 verification.
 *
 * Confirms the checkout contract holds end to end:
 *   - governorate shipping fees come from the SYNCED Safka price list
 *     (governorate_pricing), readable by anon for the checkout <select>
 *   - published products the cart needs are readable by anon (RLS)
 *   - the server-side (service-role) order flow writes orders + order_items
 *     with customer details, per-line DB prices, a server-recomputed total,
 *     the customer's governorate name AND the Safka price-list _id
 *     (shipping_governorate), the governorate shipping fee (+ markup), and the
 *     pending status
 *   - orders / order_items stay invisible to anon (RLS deny for read AND write),
 *     which is why order placement must go through the service-role route
 *
 * Note: this script exercises the same data contract as lib/orders/create.ts
 * directly against Supabase. To test the HTTP route /api/orders itself, run the
 * dev server and POST to it (Node scripts cannot import the TS module here).
 *
 * Run: npm run verify:phase4
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
 * Secrets are never printed.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (missing.length > 0) {
  console.error(`\nMissing environment variables: ${missing.join(", ")}\n`);
  process.exit(1);
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceRoleKey, authOptions);
const anon = createClient(url, anonKey, authOptions);

const TEST_SKU = "__phase4_verification__";
const PAYMENT_SKU = "__phase4_verification_total__";
const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function cleanup(orderIds, productIds) {
  for (const orderId of orderIds) {
    if (orderId) await admin.from("orders").delete().eq("id", orderId);
  }
  for (const sku of [TEST_SKU, PAYMENT_SKU]) {
    await admin.from("products").delete().eq("safka_product_id", sku);
  }
  void productIds;
}

async function insertProduct({ sku, price, stock = 5 }) {
  const { data, error } = await admin
    .from("products")
    .upsert(
      {
        safka_product_id: sku,
        name: "منتج تجريبي للطلب",
        price,
        stock,
        status: "active",
        is_published: true,
      },
      { onConflict: "safka_product_id" },
    )
    .select("id, price")
    .single();
  return { data, error };
}

async function cairoGovernorate() {
  const { data, error } = await admin
    .from("governorate_pricing")
    .select("governorate_id, name_ar, safka_shipping_fee")
    .eq("name_ar", "القاهرة")
    .maybeSingle();
  return { data, error };
}

async function main() {
  console.log("\nTradeMart Phase 4 verification\n");

  const createdIds = [];
  let productId;

  try {
    // 0. The governorate -> Safka shipping fee list lives in governorate_pricing
    //    (npm run sync:governorates / the hourly cron) and is anon-readable so
    //    the checkout <select> works.
    {
      const { data: rows, error: govListError } = await admin
        .from("governorate_pricing")
        .select("governorate_id, name_ar, safka_shipping_fee")
        .order("name_ar");
      check(
        "governorate price list synced (service-role)",
        !govListError && Array.isArray(rows) && rows.length >= 20,
        govListError?.message ?? `count=${rows?.length}`,
      );

      const cairo = (rows ?? []).find((row) => row.name_ar === "القاهرة");
      check(
        "Cairo row has a Safka price-list _id and a real fee",
        Boolean(
          cairo &&
            /^[0-9a-f]{24}$/.test(cairo.governorate_id) &&
            Number(cairo.safka_shipping_fee) > 0,
        ),
        cairo
          ? `id=${cairo.governorate_id} fee=${cairo.safka_shipping_fee}`
          : "not found",
      );

      const { count: anonGov, error: anonGovError } = await anon
        .from("governorate_pricing")
        .select("governorate_id, name_ar, safka_shipping_fee", { count: "exact", head: true });
      check(
        "anon can read governorate_pricing for checkout (RLS)",
        !anonGovError && (anonGov ?? 0) >= 20,
        anonGovError?.message ?? `count=${anonGov}`,
      );
    }

    // 1. Cart needs published products readable by anon.
    {
      const { data, error } = await insertProduct({ sku: TEST_SKU, price: 120.0 });
      check("test product inserted server-side", !error, error?.message);
      productId = data?.id;

      const { count: anonVisible, error: anonReadError } = await anon
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("id", productId)
        .eq("is_published", true);
      check(
        "anon can read the published product for the cart (RLS)",
        !anonReadError && anonVisible === 1,
        anonReadError?.message,
      );

      const { data: anonProduct, error: anonPriceError } = await anon
        .from("products")
        .select("id, name, price, image_url, stock")
        .eq("id", productId)
        .single();
      check(
        "anon sees the pricing fields the cart needs",
        !anonPriceError && Number(anonProduct?.price) === 120 && typeof anonProduct?.name === "string",
        anonPriceError?.message,
      );
    }

    // 2. Order writer contract (mirrors lib/orders/create.ts).
    {
      const second = await insertProduct({ sku: PAYMENT_SKU, price: 30.5 });
      check("second test product inserted", !second.error, second.error?.message);

      const qtyA = 2;
      const qtyB = 3;
      const expectedTotal = 120.0 * qtyA + 30.5 * qtyB; // 240 + 91.5 = 331.5

      const { data: settingsRow, error: settingsRowError } = await admin
        .from("settings")
        .select("shipping_markup")
        .eq("id", SETTINGS_ID)
        .maybeSingle();
      check(
        "settings exposes shipping_markup (service-role)",
        !settingsRowError && settingsRow && Number.isFinite(Number(settingsRow.shipping_markup)),
        settingsRowError?.message,
      );
      const markup = Number(settingsRow?.shipping_markup ?? 0) || 0;

      const { data: cairo, error: cairoError } = await cairoGovernorate();
      check("Cairo governorate resolves for the order", !cairoError && cairo, cairoError?.message);
      const shippingFee = Math.round((Number(cairo?.safka_shipping_fee ?? 0) + markup) * 100) / 100;
      const totalWithShipping = Math.round((expectedTotal + shippingFee) * 100) / 100;

      const { data: order, error: orderError } = await admin
        .from("orders")
        .insert({
          customer_name: "اختبار الطلب",
          phone: "01012345678",
          country: "Egypt",
          city: "القاهرة",
          governorate: cairo?.name_ar,
          shipping_governorate: cairo?.governorate_id,
          address: "شارع الاختبار 5",
          subtotal: expectedTotal,
          shipping_fee: shippingFee,
          total: totalWithShipping,
          status: "pending",
        })
        .select(
          "id, total, status, created_at, governorate, shipping_governorate, shipping_fee",
        )
        .single();
      check("orders accepts the checkout payload (service-role)", !orderError, orderError?.message);
      const orderId = order?.id;
      createdIds.push(orderId);
      check(
        "order total stored and status pending",
        order && Number(order.total) === totalWithShipping && order.status === "pending",
        `total=${order?.total} expected=${totalWithShipping}`,
      );
      check(
        "customer governorate name stored on the order",
        order?.governorate === "القاهرة",
        `governorate=${order?.governorate}`,
      );
      check(
        "shipping_governorate stores the Safka price-list _id",
        Boolean(order?.shipping_governorate) && order?.shipping_governorate === cairo?.governorate_id,
        `shipping_governorate=${order?.shipping_governorate}`,
      );
      check(
        "shipping_fee equals the governorate fee + markup",
        order && Number(order.shipping_fee) === shippingFee,
        `shipping_fee=${order?.shipping_fee} expected=${shippingFee}`,
      );

      const { error: itemsError } = await admin.from("order_items").insert([
        { order_id: orderId, product_id: productId, quantity: qtyA, price: 120.0 },
        { order_id: orderId, product_id: second.data?.id, quantity: qtyB, price: 30.5 },
      ]);
      check("order_items accepts line items (service-role)", !itemsError, itemsError?.message);

      const { data: storedItems } = await admin
        .from("order_items")
        .select("quantity, price")
        .eq("order_id", orderId)
        .order("price", { ascending: false });
      const sum = (storedItems ?? []).reduce(
        (acc, item) => acc + Number(item.price) * item.quantity,
        0,
      );
      check(
        "stored line totals recompute to the order subtotal",
        storedItems?.length === 2 && Math.abs(sum - expectedTotal) < 0.001,
        `sum=${sum} expected=${expectedTotal}`,
      );
    }

    // 2b. Shipping is the Safka per-governorate fee (+ markup): settings only
    //     carries the markup, the fee itself comes from the synced price list.
    {
      const { count: anonSettings, error: anonSettingsError } = await anon
        .from("settings")
        .select("*", { count: "exact", head: true });
      check(
        "anon cannot read settings (RLS deny)",
        !anonSettingsError && (anonSettings ?? 0) === 0,
        anonSettingsError?.message ?? `count=${anonSettings}`,
      );

      const { data: cairo, error: cairoError } = await cairoGovernorate();
      const subtotal = 331.5;
      const shippingFee = Number(cairo?.safka_shipping_fee ?? 0);
      const { data: breakdown, error: breakdownError } = await admin
        .from("orders")
        .insert({
          customer_name: "اختبار الشحن",
          phone: "01012345678",
          country: "Egypt",
          city: "القاهرة",
          governorate: cairo?.name_ar,
          shipping_governorate: cairo?.governorate_id,
          address: "شارع الشحن 1",
          subtotal,
          shipping_fee: shippingFee,
          total: subtotal + shippingFee,
          status: "pending",
        })
        .select("id, subtotal, shipping_fee, total")
        .single();
      check(
        "orders stores the subtotal + shipping_fee breakdown",
        !breakdownError && !cairoError && cairo,
        breakdownError?.message ?? cairoError?.message,
      );
      createdIds.push(breakdown?.id);
      check(
        "stored total equals subtotal + shipping_fee",
        breakdown &&
          Math.abs(
            Number(breakdown.total) -
              (Number(breakdown.subtotal) + Number(breakdown.shipping_fee)),
          ) < 0.001,
      );
    }

    // 3. RLS: anon cannot read OR write orders / order_items.
    {
      const { count: anonOrders, error: anonOrdersError } = await anon
        .from("orders")
        .select("*", { count: "exact", head: true });
      check(
        "anon cannot read orders (RLS deny)",
        !anonOrdersError && (anonOrders ?? 0) === 0,
        anonOrdersError?.message ?? `count=${anonOrders}`,
      );

      const { error: anonInsertOrderError } = await anon.from("orders").insert({
        customer_name: "مخترق",
        phone: "01011111111",
        country: "Egypt",
        city: "القاهرة",
        address: "اختراق",
        total: 1,
      });
      check("anon cannot insert orders (RLS deny)", anonInsertOrderError !== null, anonInsertOrderError?.message);

      const { count: anonItems, error: anonItemsError } = await anon
        .from("order_items")
        .select("*", { count: "exact", head: true });
      check(
        "anon cannot read order_items (RLS deny)",
        !anonItemsError && (anonItems ?? 0) === 0,
        anonItemsError?.message ?? `count=${anonItems}`,
      );
    }

    // 4. Unpublished / out-of-stock products must not be orderable — verify the
    //    storefront hides them (the server/recompute path is in lib/orders).
    {
      await admin.from("products").update({ is_published: false }).eq("id", productId);
      const { count: hidden } = await anon
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("id", productId);
      check("unpublished product hidden from anon (can't be ordered)", hidden === 0, `count=${hidden}`);
    }

  } catch (error) {
    check("verification ran without throwing", false, error?.message ?? String(error));
  } finally {
    await cleanup(createdIds);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();