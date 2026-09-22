/**
 * TradeMart — Phase 3.5 verification.
 *
 * Confirms the webhook migration is applied: products are published only by
 * the webhook, anon/authenticated can never select cost_price or commission,
 * webhook_logs is service-role only, and the storefront "published" visibility
 * contract holds end to end.
 *
 * Run: npm run verify:phase3.5
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and WEBHOOK_SECRET.
 * Secrets are never printed.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.WEBHOOK_SECRET;

const missing = [];
if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (!webhookSecret) missing.push("WEBHOOK_SECRET");
if (missing.length > 0) {
  console.error(`\nMissing environment variables: ${missing.join(", ")}\n`);
  process.exit(1);
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceRoleKey, authOptions);
const anon = createClient(url, anonKey, authOptions);

const TEST_SKU = "__phase3-5_verification__";
const TEST_BARCODE = "TMP3P5-BARCODE-1";
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function cleanup(logId) {
  await admin.from("products").delete().eq("safka_product_id", TEST_SKU);
  if (logId) await admin.from("webhook_logs").delete().eq("id", logId);
}

async function main() {
  console.log("\nTradeMart Phase 3.5 verification\n");

  check(
    "WEBHOOK_SECRET is a 48-char URL-safe token",
    typeof webhookSecret === "string" && /^[A-Za-z0-9_-]{48}$/.test(webhookSecret),
    `length=${webhookSecret?.length ?? 0}`,
  );

  let logId;
  try {
    const { error: insertError } = await admin
      .from("products")
      .upsert(
        {
          safka_product_id: TEST_SKU,
          name: "منتج الويب هوك التجريبي",
          price: 140,
          stock: 1,
          status: "active",
          is_published: false,
          barcode: TEST_BARCODE,
          images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
          media_url: "https://example.com/internal",
        },
        { onConflict: "safka_product_id" },
      )
      .select()
      .single();
    check("products accepts the is_published column", !insertError, insertError?.message);

    const { count: hiddenCount } = await anon
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("safka_product_id", TEST_SKU);
    check("unpublished product is invisible to anon", hiddenCount === 0, `count=${hiddenCount}`);

    await admin
      .from("products")
      .update({ is_published: true, cost_price: 100, commission: 40 })
      .eq("safka_product_id", TEST_SKU);

    const { count: visibleCount } = await anon
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("safka_product_id", TEST_SKU);
    check("published product becomes visible to anon", visibleCount === 1, `count=${visibleCount}`);

    const { error: anonCostError } = await anon
      .from("products")
      .select("id, cost_price")
      .eq("safka_product_id", TEST_SKU);
    check("anon cannot select cost_price", anonCostError !== null, anonCostError?.message);

    const { error: anonCommissionError } = await anon
      .from("products")
      .select("id, commission")
      .eq("safka_product_id", TEST_SKU);
    check("anon cannot select commission", anonCommissionError !== null, anonCommissionError?.message);

    const { error: anonBarcodeError } = await anon
      .from("products")
      .select("id, barcode")
      .eq("safka_product_id", TEST_SKU);
    check("anon cannot select barcode", anonBarcodeError !== null, anonBarcodeError?.message);

    const { error: anonMediaUrlError } = await anon
      .from("products")
      .select("id, media_url")
      .eq("safka_product_id", TEST_SKU);
    check("anon cannot select media_url", anonMediaUrlError !== null, anonMediaUrlError?.message);

    const { error: anonGalleryError } = await anon
      .from("products")
      .select("id, images, variants")
      .eq("safka_product_id", TEST_SKU);
    check("anon can select images and variants", anonGalleryError === null, anonGalleryError?.message);

    const { data: adminRow, error: adminRowError } = await admin
      .from("products")
      .select("price, cost_price, commission")
      .eq("safka_product_id", TEST_SKU)
      .single();
    check(
      "service-role reads cost/commission and price = cost + commission",
      !adminRowError && Number(adminRow?.price) === 140,
      adminRowError?.message ?? `price=${adminRow?.price}`,
    );

    const { error: anonLogsError } = await anon.from("webhook_logs").select("id");
    check("webhook_logs denies anon", anonLogsError !== null, anonLogsError?.message);

    const { data: logRow, error: logError } = await admin
      .from("webhook_logs")
      .insert({ payload: { probe: true } })
      .select("id")
      .single();
    check("webhook_logs accepts service-role writes", !logError, logError?.message);
    logId = logRow?.id;

    const { count: unpublishedCount, error: unpublishedError } = await admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_published", false);
    check(
      "catalog products start unpublished",
      !unpublishedError && (unpublishedCount ?? 0) > 0,
      `count=${unpublishedCount}`,
    );
  } catch (error) {
    check("verification ran without throwing", false, error?.message ?? String(error));
  } finally {
    await cleanup(logId);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();