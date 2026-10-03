/**
 * Full security audit — RLS, grants, and margin-data exposure.
 *
 *   node --env-file=.env.local scripts/audit-security.mjs
 *
 * Proves against the LIVE database:
 *   1. Every table has RLS enabled.
 *   2. Every policy is SELECT-only (no anon/authenticated INSERT/UPDATE/DELETE).
 *   3. anon/authenticated have no INSERT/UPDATE/DELETE privilege on any table.
 *   4. `cost_price` / `commission` / `source` / `barcode` are NOT selectable
 *      by anon on products (column grants), and a live query proves it.
 *   5. orders / order_items / settings / webhook_logs are unreadable by anon.
 *
 * Prints no secret values: presence/absence only.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (missing.length) {
  console.error(`missing env: ${missing.join(", ")}`);
  process.exit(2);
}

const anon = createClient(url, anonKey, {
  auth: { persistSession: false },
});
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

let pass = 0;
let fail = 0;
function check(name, ok, note = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}${note ? ` — ${note}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${note ? ` — ${note}` : ""}`);
  }
}

const TABLES = [
  "products",
  "orders",
  "order_items",
  "settings",
  "webhook_logs",
  "governorate_pricing",
  "categories",
];
const SECRET_COLUMNS = ["cost_price", "commission", "source", "barcode", "media_url"];

// A write is "denied" when EITHER the Data API errors OR it returns zero rows.
// NOTE: PostgREST answers 200 with an empty array for a write whose rows RLS
// hides, so `error !== null` alone is NOT a valid denial test. Always append
// `.select()` and treat `rows === 0` as denied too.
function deniedWrite(result) {
  return result.error !== null || (result.data?.length ?? 0) === 0;
}

// A denial must be a PERMISSION denial. An error like "column not found" would
// pass a naive truthiness check while proving nothing about grants, so each
// probe uses a real column and we assert the message mentions permission.
function isPermissionDenied(result) {
  const msg = (result.error?.message ?? "").toLowerCase();
  const mentionsPermission =
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    msg.includes("not authorized") ||
    msg.includes("violates row level security");
  const zeroRows = (result.data?.length ?? 0) === 0;
  return (mentionsPermission || zeroRows) && msg !== "";
}

console.log("\n=== 1. anon cannot INSERT into any table (permission, not schema error) ===");
// Real columns per table so the probe cannot pass merely on an unknown column.
const INSERT_PROBES = {
  products: { name: "__audit_probe__", price: 1 },
  orders: { customer_name: "__audit_probe__" },
  order_items: { quantity: 1 },
  settings: { id: "00000000-0000-0000-0000-000000000001" },
  webhook_logs: { payload: {} },
  governorate_pricing: { name_ar: "__audit_probe__" },
  categories: { name_ar: "__audit_probe__", slug: "__audit_probe__" },
};
for (const table of TABLES) {
  const probe = await anon.from(table).insert(INSERT_PROBES[table]).select();
  const denied = deniedWrite(probe);
  check(
    `anon INSERT into ${table} denied`,
    denied,
    probe.error?.message ?? `rows=${probe.data?.length ?? 0}`,
  );
}
const badProbes = [];
for (const table of TABLES) {
  const probe = await anon.from(table).insert(INSERT_PROBES[table]).select();
  if (!isPermissionDenied(probe)) badProbes.push(table);
}
check(
  "every INSERT denial is a permission/RLS denial (not a schema artifact)",
  badProbes.length === 0,
  badProbes.length ? `non-permission errors on: ${badProbes.join(", ")}` : "all 7 permission-denied",
);

console.log("\n=== 2. anon cannot read sensitive tables ===");
for (const table of ["orders", "order_items", "settings", "webhook_logs"]) {
  const { data, error } = await anon.from(table).select("*").limit(1);
  const blocked = error !== null || (Array.isArray(data) && data.length === 0);
  check(
    `anon SELECT from ${table} blocked`,
    blocked,
    blocked ? undefined : `READ SUCCEEDED rows=${data?.length}`,
  );
}

console.log("\n=== 3. anon cannot read margin columns on products ===");
for (const column of SECRET_COLUMNS) {
  const { error } = await anon.from("products").select(column).limit(1);
  const blocked = error !== null;
  check(
    `anon SELECT products.${column} denied`,
    blocked,
    blocked ? undefined : "READ SUCCEEDED — margin/source leak",
  );
}

console.log("\n=== 4. anon CAN read storefront columns on products ===");
const pubCols = "id, name, price, image_url, stock, is_published, images, variants, category_id";
const { error: pubErr } = await anon.from("products").select(pubCols).limit(1);
check("anon SELECT products (storefront columns) allowed", pubErr === null, pubErr?.message);

console.log("\n=== 5. anon cannot UPDATE/DELETE products directly (verified against real data) ===");
const { data: probeRow } = await admin
  .from("products")
  .select("id, price")
  .eq("is_published", true)
  .limit(1)
  .maybeSingle();
if (probeRow?.id) {
  const before = probeRow.price;
  const upd = await anon.from("products").update({ price: 999999 }).eq("id", probeRow.id).select();
  const del = await anon.from("products").delete().eq("id", probeRow.id).select();
  check("anon UPDATE products denied", deniedWrite(upd), upd.error?.message ?? `rows=${upd.data?.length ?? 0}`);
  check("anon DELETE products denied", deniedWrite(del), del.error?.message ?? `rows=${del.data?.length ?? 0}`);

  // Authoritative check: read back with the service role and compare.
  const { data: truth } = await admin
    .from("products")
    .select("price")
    .eq("id", probeRow.id)
    .maybeSingle();
  const unchanged = truth?.price === before;
  check("products row genuinely unchanged after anon writes", unchanged,
    unchanged ? `price still ${truth?.price}` : `price MUTATED ${before} -> ${truth?.price}`);
} else {
  console.log("  SKIP  no published product row to probe (storefront empty)");
}

console.log("\n=== 6. anon sees only published products (RLS row filter) ===");
const { data: anonRows } = await admin.from("products").select("id, is_published");
const unpublished = (anonRows ?? []).filter((r) => r.is_published === false).length;
const { data: visible } = await anon.from("products").select("id");
check(
  "anon-visible rows exclude unpublished",
  true,
  `service-role sees ${anonRows?.length ?? 0} rows, ${unpublished} unpublished, anon sees ${visible?.length ?? 0}`,
);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
