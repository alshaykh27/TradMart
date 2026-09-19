/**
 * TradeMart — Phase 2 verification.
 *
 * Confirms the Safka Public API is reachable with the api-safka-key header,
 * that the synced product catalog matches Safka's totals, and that Row Level
 * Security exposes only active products to the storefront (anon) client.
 *
 * Run: npm run verify:phase2
 *
 * Requires .env.local with SAFKA_API_BASE_URL, SAFKA_API_KEY,
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY. Secrets are never printed.
 */
import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.SAFKA_API_BASE_URL;
const apiKey = process.env.SAFKA_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!baseUrl) missing.push("SAFKA_API_BASE_URL");
if (!apiKey) missing.push("SAFKA_API_KEY");
if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

if (missing.length > 0) {
  console.error(`\nMissing environment variables: ${missing.join(", ")}\n`);
  process.exit(1);
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceRoleKey, authOptions);
const anon = createClient(supabaseUrl, anonKey, authOptions);

let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  console.log("\nTradeMart Phase 2 verification\n");

  // 1. Safka reachable with the api-safka-key header.
  const response = await fetch(`${baseUrl}/api/v1/public/products?page=1&size=1`, {
    headers: { "api-safka-key": apiKey },
    cache: "no-store",
  });
  let meta = null;
  if (response.ok) {
    meta = await response.json();
  }
  check(
    "Safka API reachable with api-safka-key header",
    response.ok && Array.isArray(meta?.data) && meta.data.length > 0,
    response.ok ? `status=${response.status} totalItems=${meta?.totalItems}` : `status=${response.status}`,
  );

  const totalItems = meta?.totalItems ?? 0;
  check("Safka reports a product catalog", totalItems > 0, `totalItems=${totalItems}`);

  // 2. Local products table matches Safka totals.
  const { count: dbCount, error: countError } = await admin
    .from("products")
    .select("*", { count: "exact", head: true });
  check("products table count matches Safka", !countError && dbCount === totalItems, `db=${dbCount} safka=${totalItems}`);

  // 3. safka_product_id is unique across the table.
  const { data: ids, error: idsError } = await admin
    .from("products")
    .select("safka_product_id")
    .order("safka_product_id");
  const uniqueIds = new Set((ids ?? []).map((row) => row.safka_product_id));
  check(
    "safka_product_id values are unique",
    !idsError && uniqueIds.size === (ids?.length ?? 0),
    `rows=${ids?.length ?? 0} unique=${uniqueIds.size}`,
  );

  // 4. Active products exist and are anon-readable (RLS).
  const { count: activeCount, error: activeError } = await admin
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");
  check("active products exist", !activeError && activeCount > 0, `active=${activeCount}`);

  const { count: anonVisibleCount, error: anonError } = await anon
    .from("products")
    .select("*", { count: "exact", head: true });
  check(
    "anon sees exactly the active products (RLS)",
    !anonError && anonVisibleCount === activeCount,
    `anon=${anonVisibleCount} active=${activeCount}`,
  );

  // 5. A sample active product has the fields the storefront needs.
  const { data: sample, error: sampleError } = await admin
    .from("products")
    .select("safka_product_id, name, price, image_url, stock, status")
    .eq("status", "active")
    .limit(1)
    .single();
  check(
    "sample active product has name, price, image",
    !sampleError &&
      typeof sample?.name === "string" &&
      sample.name.length > 0 &&
      Number(sample.price) > 0 &&
      typeof sample.image_url === "string",
    sampleError?.message ?? `name="${sample?.name}" price=${sample?.price}`,
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nVerification error: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});