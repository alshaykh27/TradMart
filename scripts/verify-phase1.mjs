/**
 * TradeMart — Phase 1 verification.
 *
 * Confirms the Supabase schema exists, the environment variables load, the
 * server-side service-role client works, and Row Level Security blocks
 * browser (anon) access to private tables.
 *
 * Run: npm run verify:phase1
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
  console.error(`\nMissing environment variables: ${missing.join(", ")}`);
  console.error("Create .env.local (see .env.example) and run again.\n");
  process.exit(1);
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceRoleKey, authOptions);
const anon = createClient(url, anonKey, authOptions);

const TEST_SKU = "__phase1_verification__";
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function cleanup(orderId) {
  // order_items.order_id has ON DELETE CASCADE, so removing the order removes
  // its items too.
  if (orderId) await admin.from("orders").delete().eq("id", orderId);
  await admin.from("products").delete().eq("safka_product_id", TEST_SKU);
}

async function main() {
  console.log("\nTradeMart Phase 1 verification\n");

  let productId;
  let orderId;

  try {
    // 1. Schema exists — service-role insert.
    const { data: inserted, error: insertError } = await admin
      .from("products")
      .upsert(
        {
          safka_product_id: TEST_SKU,
          name: "منتج اختبار",
          description: "Test product created by verify:phase1",
          price: 12.5,
          stock: 3,
          status: "active",
        },
        { onConflict: "safka_product_id" },
      )
      .select()
      .single();

    check("products table exists and accepts a server-side insert", !insertError, insertError?.message);
    productId = inserted?.id;
    check("inserted product has a uuid id", typeof productId === "string" && productId.length === 36);

    // 2. Anon can read the active product (RLS select policy).
    const { count: anonActiveCount } = await anon
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("safka_product_id", TEST_SKU);
    check("anon can read an active product", anonActiveCount === 1, `count=${anonActiveCount}`);

    // 3. Anon cannot read an inactive product (RLS filters it out).
    await admin.from("products").update({ status: "inactive" }).eq("id", productId);
    const { count: anonInactiveCount } = await anon
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("safka_product_id", TEST_SKU);
    check("anon cannot read an inactive product", anonInactiveCount === 0, `count=${anonInactiveCount}`);

    // 4. updated_at trigger fires on update.
    await admin.from("products").update({ status: "active", name: "منتج اختبار محدث" }).eq("id", productId);
    const { data: afterUpdate } = await admin
      .from("products")
      .select("created_at, updated_at, name")
      .eq("id", productId)
      .single();
    check(
      "updated_at trigger updates the timestamp",
      afterUpdate && afterUpdate.updated_at !== afterUpdate.created_at,
      afterUpdate ? `updated=${afterUpdate.updated_at}` : "",
    );

    // 5. Orders + order_items can be written server-side.
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        customer_name: "اختبار",
        phone: "0500000000",
        country: "SA",
        city: "الرياض",
        address: "عنوان اختبار",
        total: 37.5,
        status: "pending",
      })
      .select()
      .single();
    check("orders table exists and accepts a server-side insert", !orderError, orderError?.message);
    orderId = order?.id;

    const { error: itemError } = await admin.from("order_items").insert({
      order_id: orderId,
      product_id: productId,
      quantity: 3,
      price: 12.5,
    });
    check("order_items table exists and accepts a server-side insert", !itemError, itemError?.message);

    // 6. Anon is denied all access to private tables.
    const { count: anonOrders, error: anonOrdersError } = await anon
      .from("orders")
      .select("*", { count: "exact", head: true });
    check(
      "anon cannot read orders (RLS deny)",
      !anonOrdersError && (anonOrders ?? 0) === 0,
      anonOrdersError ? anonOrdersError.message : `count=${anonOrders}`,
    );

    const { count: anonOrderItems, error: anonItemsError } = await anon
      .from("order_items")
      .select("*", { count: "exact", head: true });
    check(
      "anon cannot read order_items (RLS deny)",
      !anonItemsError && (anonOrderItems ?? 0) === 0,
      anonItemsError ? anonItemsError.message : `count=${anonOrderItems}`,
    );

    const { count: anonSettings, error: anonSettingsError } = await anon
      .from("settings")
      .select("*", { count: "exact", head: true });
    check(
      "anon cannot read settings (RLS deny)",
      !anonSettingsError && (anonSettings ?? 0) === 0,
      anonSettingsError ? anonSettingsError.message : `count=${anonSettings}`,
    );

    // 7. Seeded settings row is readable server-side.
    const { data: settings, error: settingsError } = await admin
      .from("settings")
      .select("id, store_name")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    check(
      "seeded settings row exists",
      !settingsError && settings?.store_name === "TradeMart",
      settingsError?.message ?? settings?.store_name,
    );
  } catch (error) {
    check("verification ran without throwing", false, error?.message ?? String(error));
  } finally {
    await cleanup(orderId);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
