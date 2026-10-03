/**
 * Phase 7 verification — real product categories.
 *
 * Run: npm run verify:phase7   (after applying the phase 7 migration)
 *
 * Proves the four claims this phase makes, against the live database:
 *   1. categories exists, is anon-readable, and the 8 sections are seeded
 *   2. the anon key can FILTER products by category_id (the /products query)
 *   3. a category survives a real Safka sync  ← the important one
 *   4. admin bulk assignment works across both manual and Safka rows
 *
 * The scenario picks one real Safka-synced product, assigns it a category,
 * re-runs the actual sync script, then re-reads the row. It restores the
 * product to category_id = null at the end so the catalogue is left clean.
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const missing = [];
if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (missing.length > 0) {
  console.error(`\nMissing environment variables: ${missing.join(", ")}\n`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function heading(text) {
  console.log(`\n${text}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

async function main() {
  console.log("TradeMart — phase 7 categories verification");

  // ---------------------------------------------------------------- schema
  heading("1. Schema");

  const { data: categories, error: catError } = await admin
    .from("categories")
    .select("id, name_ar, slug, icon, display_order")
    .order("display_order");

  check(
    "categories table is readable",
    !catError,
    catError?.message ?? `${categories?.length ?? 0} rows`,
  );

  const expectedSlugs = [
    "electronics",
    "mobiles",
    "home-kitchen",
    "fashion",
    "beauty",
    "kids",
    "sports",
    "tools",
  ];
  const actualSlugs = (categories ?? []).map((row) => row.slug);
  // Guarded so a missing table cannot report these two as vacuously true.
  const hasRows = actualSlugs.length > 0;
  check(
    "slugs are unique",
    hasRows && new Set(actualSlugs).size === actualSlugs.length,
    `${new Set(actualSlugs).size}/${actualSlugs.length}`,
  );
  check(
    "display_order is set on every section",
    hasRows && (categories ?? []).every((row) => typeof row.display_order === "number"),
    hasRows ? "" : "no sections to check",
  );

  // Guards the bug that motivated this check: the seed SQL reached the database
  // through a clipboard round trip that double-encoded the Arabic, so name_ar
  // held mojibake and every surface rendered garbage instead of Arabic.
  const arabicPattern = /[\u0600-\u06FF]/u;
  const badNames = (categories ?? []).filter((row) => !arabicPattern.test(row.name_ar ?? ""));
  check(
    "every name_ar holds real Arabic (not mojibake)",
    hasRows && badNames.length === 0,
    badNames.length === 0
      ? ""
      : `${badNames.length} corrupt: ${badNames.map((r) => r.slug).join(", ")}`,
  );

  const badIcons = (categories ?? []).filter((row) => {
    const icon = row.icon ?? "";
    if (icon === "") return false;
    return !arabicPattern.test(icon) && !/\p{Extended_Pictographic}/u.test(icon);
  });
  check(
    "every icon holds a real emoji (not mojibake)",
    hasRows && badIcons.length === 0,
    badIcons.length === 0 ? "" : `${badIcons.length} corrupt: ${badIcons.map((r) => r.slug).join(", ")}`,
  );

  const target = (categories ?? []).find((row) => row.slug === "electronics");
  if (!target) {
    check("8 sections seeded with stable slugs", false, actualSlugs.join(", ") || "none");
    console.error("\nCannot continue: no 'electronics' section to test with.");
    // exitCode rather than process.exit(): exiting hard while the Supabase
    // client's sockets are still closing trips a libuv assertion on Windows.
    process.exitCode = 1;
    return;
  }
  check("8 sections seeded with stable slugs", expectedSlugs.every((slug) => actualSlugs.includes(slug)));

  // -------------------------------------------------------- anon behaviour
  heading("2. Storefront (anon key)");

  const { data: anonCategories, error: anonError } = await anon
    .from("categories")
    .select("id, name_ar, slug")
    .order("display_order");

  check(
    "anon can read categories",
    !anonError && (anonCategories ?? []).length === (categories ?? []).length,
    anonError?.message ?? `${anonCategories?.length ?? 0} rows`,
  );

  // The exact shape /products uses. A column-level grant mistake shows up here
  // as a PostgREST permission error, not as an empty list.
  const { data: anonFiltered, error: filterError } = await anon
    .from("products")
    .select("id, name")
    .eq("is_published", true)
    .eq("category_id", target.id)
    .limit(5);

  check(
    "anon can FILTER published products by category_id",
    !filterError,
    filterError?.message ?? `${anonFiltered?.length ?? 0} rows`,
  );

  const { error: unfilteredError } = await anon
    .from("products")
    .select("id")
    .eq("is_published", true)
    .limit(1);
  check("anon can still list published products", !unfilteredError);

  const { error: leakError } = await anon
    .from("products")
    .select("cost_price, commission, source")
    .limit(1);
  check(
    "anon still cannot read cost/commission/source",
    Boolean(leakError),
    leakError ? "denied as expected" : "LEAK: columns readable!",
  );

  // -------------------------------------------------- the sync-preservation
  heading("3. A category survives a real Safka sync");

  const { data: safkaProduct, error: pickError } = await admin
    .from("products")
    .select("id, name, safka_product_id, source, category_id, price, stock, updated_at")
    .eq("source", "safka")
    .not("safka_product_id", "is", null)
    .is("category_id", null)
    .order("is_published", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pickError || !safkaProduct) {
    check("found an uncategorised Safka product to test with", false, pickError?.message);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log(
    `  using: "${safkaProduct.name}" (safka id ${safkaProduct.safka_product_id})`,
  );

  const { data: assigned, error: assignError } = await admin
    .from("products")
    .update({ category_id: target.id })
    .eq("id", safkaProduct.id)
    .select("id, category_id")
    .single();

  check(
    "assigned a category via PATCH-equivalent write",
    !assignError && assigned?.category_id === target.id,
    assignError?.message ?? "done",
  );

  console.log("\n  running the real sync (npm run sync:products) …");
  const sync = await run("npm", ["run", "sync:products"]);
  const syncOk = sync.code === 0;
  console.log(
    `  sync exited ${sync.code}` +
      (syncOk ? "" : `\n${sync.output.split("\n").slice(-15).join("\n")}`),
  );
  check("sync ran successfully", syncOk);

  const { data: afterSync, error: afterError } = await admin
    .from("products")
    .select("id, name, category_id, price, stock, updated_at")
    .eq("id", safkaProduct.id)
    .single();

  check(
    "category_id SURVIVED the sync",
    !afterError && afterSync?.category_id === target.id,
    afterError?.message ??
      (afterSync?.category_id === target.id
        ? "still assigned to electronics"
        : `was ${target.id}, now ${afterSync?.category_id}`),
  );

  // Proof the sync really rewrote this row, so the check above is meaningful.
  // This deliberately does NOT assert that price or stock changed: once the
  // local copy matches Safka, a resync writes identical values and the old
  // check failed spuriously. The products_updated_at trigger advances
  // updated_at on every write, which is deterministic.
  const rowRewritten =
    !afterError &&
    typeof afterSync?.updated_at === "string" &&
    afterSync.updated_at > (safkaProduct.updated_at ?? "");
  check(
    "the sync actually touched the row (so the test is meaningful)",
    rowRewritten,
    !afterError
      ? `updated_at ${safkaProduct.updated_at}->${afterSync?.updated_at} (price ${safkaProduct.price}->${afterSync?.price}, stock ${safkaProduct.stock}->${afterSync?.stock})`
      : afterError?.message,
  );

  // ------------------------------------------------------------ admin bulk
  heading("4. Admin bulk assignment");

  // NOTE: deliberately unfiltered. Bulk assignment must work on an already
  // categorised row too, so the test needs to touch one. That makes it the most
  // destructive part of this script, which is why the prior category_id is read
  // here and restored exactly in the cleanup below.
  const { data: bulkRows } = await admin
    .from("products")
    .select("id, category_id")
    .limit(3);
  const bulkBefore = bulkRows ?? [];
  const ids = bulkBefore.map((row) => row.id);

  if (ids.length > 0) {
    const { data: bulkResult, error: bulkError } = await admin
      .from("products")
      .update({ category_id: target.id })
      .in("id", ids)
      .select("id");
    check(
      "bulk assign writes every selected row",
      !bulkError && bulkResult?.length === ids.length,
      bulkError?.message ?? `${bulkResult?.length}/${ids.length} rows`,
    );
  }

  // ------------------------------------------------------------- cleanup
  heading("5. Cleanup");

  // Every row this script wrote to, with the category_id it held beforehand.
  const touched = [
    { id: safkaProduct.id, category_id: safkaProduct.category_id ?? null },
    ...bulkBefore,
  ];

  // Restore each row to the value it actually had, grouped so this stays a
  // couple of queries instead of one per row. Never blanket-null: the merchant
  // may have categorised rows that this script then overwrote.
  const byPreviousValue = new Map();
  for (const row of touched) {
    const key = row.category_id ?? "null";
    if (!byPreviousValue.has(key)) byPreviousValue.set(key, []);
    byPreviousValue.get(key).push(row.id);
  }

  let restoreError = null;
  for (const [previous, idList] of byPreviousValue) {
    const { error } = await admin
      .from("products")
      .update({ category_id: previous === "null" ? null : previous })
      .in("id", idList);
    if (error) {
      restoreError = error;
      break;
    }
  }

  check(
    "restored every row the test touched to its original category",
    !restoreError,
    restoreError?.message,
  );

  // The rows must be back to their original values, not merely "no error".
  const { data: afterRestore } = await admin
    .from("products")
    .select("id, category_id")
    .in("id", touched.map((row) => row.id));

  const expected = new Map(touched.map((row) => [row.id, row.category_id ?? null]));
  const drifted = (afterRestore ?? []).filter((row) => row.category_id !== (expected.get(row.id) ?? null));
  check(
    "no row was left with the wrong category",
    drifted.length === 0,
    drifted.length === 0
      ? `${touched.length} row(s) verified`
      : drifted.map((r) => `${r.id}: expected ${expected.get(r.id)}, found ${r.category_id}`).join("; "),
  );

  // Informational, not a pass/fail: anything still categorised is the
  // merchant's own work, untouched by this script.
  const { count: remaining } = await admin
    .from("products")
    .select("id", { count: "exact", head: true })
    .not("category_id", "is", null);
  console.log(
    `  note: ${remaining ?? 0} product(s) currently carry a category (yours, not the test's)`,
  );

  console.log(`\n${failed === 0 ? "OK" : "FAILED"} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});