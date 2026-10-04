/**
 * TradeMart — Safka product sync (Phase 2, updated in Phase 3.5.1).
 *
 * Fetches every product from the Safka Public API and seeds new products into
 * Supabase (is_published = false, cost_price = Safka's sale_price, price the
 * same value because a new row has no commission yet). Every existing non-manual
 * product is then refreshed with ONLY cost_price, price, stock and status —
 * published or not. commission and is_published are never written by this
 * script: they are merchant decisions, and neither appears in any payload below.
 * Cost changes are logged to stdout.
 *
 * Rows with source = 'manual' are created by hand in the admin panel and are
 * skipped entirely: they are absent from every read below, so this script can
 * neither refresh nor deactivate them.
 *
 * Run: npm run sync:products
 *
 * Requires .env.local with SAFKA_API_BASE_URL, SAFKA_API_KEY,
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Secrets are never printed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SafkaProduct, SafkaProductList, SafkaProductProperty } from "../types/safka";
// Explicit .ts extension (not the extensionless form used for the type-only
// import above, which Node erases): this is a runtime import and Node's type
// stripping does not rewrite specifiers.
import { deriveSyncedPrice } from "../lib/products/pricing.ts";

const missing: string[] = [];
const baseUrl = process.env.SAFKA_API_BASE_URL;
const apiKey = process.env.SAFKA_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl) missing.push("SAFKA_API_BASE_URL");
if (!apiKey) missing.push("SAFKA_API_KEY");
if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

if (missing.length > 0) {
  console.error(`\nMissing environment variables: ${missing.join(", ")}\n`);
  process.exit(1);
}

const PAGE_SIZE = 100;
/** Rows are written a few at a time, but each in its own request (see below). */
const WRITE_CONCURRENCY = 10;

type RefreshRow = {
  id: string;
  cost_price: number;
  price: number;
  stock: number;
  status: string;
};

/**
 * The only columns a sync run may write on an existing product.
 *
 * commission and is_published are deliberately absent — both are merchant
 * decisions, and the merchant is not this script.
 */
function refreshPayload(row: RefreshRow) {
  return {
    cost_price: row.cost_price,
    price: row.price,
    stock: row.stock,
    status: row.status,
  };
}

function admin(): SupabaseClient {
  return createClient(supabaseUrl as string, serviceRoleKey as string, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function fetchPage(page: number, size: number): Promise<SafkaProductList> {
  const url = `${baseUrl}/api/v1/public/products?page=${page}&size=${size}`;
  const response = await fetch(url, {
    headers: { "api-safka-key": apiKey as string },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Safka API ${response.status} error for ${url}`);
  }
  return (await response.json()) as SafkaProductList;
}

// The Safka API exposes no dedicated stock field; properties[].value is the
// available quantity (verified against getProduct for the real product).
function computeStock(product: SafkaProduct): number {
  if ((product.is_active ?? false) === false) return 0;
  const props = product.properties ?? [];
  const availableProps = props.filter((p) => p.is_available !== false);
  if (availableProps.length === 0) return 0;
  return availableProps.reduce((sum, p) => sum + toInteger(p.value), 0);
}

function toInteger(value: number | null | undefined): number {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

function toGallery(product: SafkaProduct): string[] | null {
  const urls: string[] = [];
  const add = (url: string | null | undefined) => {
    if (url && /^https?:\/\/.+/.test(url) && !urls.includes(url)) urls.push(url);
  };
  for (const item of product.images ?? []) add(item);
  add(product.image);
  return urls.length > 0 ? urls : null;
}

function toVariants(product: SafkaProduct): Record<string, unknown>[] | null {
  const props = product.properties ?? [];
  if (props.length < 2) return null;
  return props.map((p: SafkaProductProperty) => ({
    _id: p._id ?? null,
    key: p.key ?? null,
    value: toInteger(p.value),
    min: p.min ?? null,
    sale_price: p.sale_price ?? null,
    is_available: p.is_available !== false,
  }));
}

async function main() {
  console.log("\nSafka product sync\n");

  const database = admin();
  const seenIds: string[] = [];
  const pages: SafkaProduct[] = [];
  let page = 1;
  let totalItems = 0;

  do {
    const list = await fetchPage(page, PAGE_SIZE);
    totalItems = list.totalItems;
    pages.push(...list.data);
    for (const item of list.data) seenIds.push(item._id);
    page += 1;
    if (page > list.pages) break;
  } while (pages.length < totalItems);

  // Manual products are excluded from every write below — not just the
  // refresh below, but also the stale sweep at the end, which would otherwise
  // deactivate every hand-written row (they have no Safka id to match).
  const { data: existingRows, error: lookupError } = await database
    .from("products")
    .select("id, safka_product_id, barcode, is_published, commission, cost_price")
    .neq("source", "manual");
  if (lookupError) throw new Error(`Local lookup failed: ${lookupError.message}`);

  const bySafkaId = new Map<string, typeof existingRows[number]>();
  const byBarcode = new Map<string, typeof existingRows[number]>();
  for (const row of existingRows ?? []) {
    if (row.safka_product_id) bySafkaId.set(row.safka_product_id, row);
    if (row.barcode) byBarcode.set(row.barcode, row);
  }

  // category_id is deliberately absent from every payload below. Safka has no
  // concept of a storefront category, so it is merchant metadata assigned in
  // /admin/products; adding it to toInsert or to refreshPayload() would
  // silently clear the categorisation on the next sync run.
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: RefreshRow[] = [];
  let costChanged = 0;

  for (const item of pages) {
    const existing = bySafkaId.get(item._id) ?? (item.barcode ? byBarcode.get(item.barcode) : undefined);

    if (!existing) {
      // Safka's own `sale_price` is the supplier cost (see lib/safka/webhook.ts),
      // so it seeds both columns. cost_price must not be left null here: it is
      // the only base a later commission edit has to add the markup to, and a
      // null cost made a freshly synced product impossible to price up.
      const cost = Number(item.sale_price ?? 0);
      toInsert.push({
        safka_product_id: item._id,
        barcode: item.barcode ?? null,
        name: item.name,
        description: item.description ?? null,
        image_url: item.image ?? item.images?.[0] ?? null,
        images: toGallery(item),
        variants: toVariants(item),
        price: cost,
        cost_price: cost,
        commission: null,
        stock: computeStock(item),
        status: item.is_active ? "active" : "inactive",
        is_published: false,
        source: "safka",
      });
      continue;
    }

    // Every non-manual row is refreshed, published or not. The gate that used to
    // skip unpublished rows existed to protect commission and is_published — but
    // neither is in the per-row payload below, so it only ever withheld
    // cost_price, which is pure Safka input. Skipping it left every freshly
    // synced product with no cost, so no commission could be added to one until
    // it happened to be published first.
    const newCost = Number(item.sale_price ?? 0);
    // Same derivation the admin commission editor uses, so a sync and a manual
    // edit can never disagree about the customer-facing price.
    const newPrice = deriveSyncedPrice(newCost, existing.commission) ?? newCost;

    if (existing.cost_price !== newCost) costChanged += 1;
    console.log(
      `SYNC cost change  ${item._id}: ${existing.cost_price ?? "-"} -> ${newCost} (display ${newPrice})`,
    );

    toUpdate.push({
      id: existing.id,
      cost_price: newCost,
      price: newPrice,
      stock: computeStock(item),
      status: item.is_active ? "active" : "inactive",
    });
  }

  if (toInsert.length > 0) {
    const { error } = await database
      .from("products")
      .upsert(toInsert, { onConflict: "safka_product_id" });
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }

  // One request per row, never a bulk array body. PostgREST pairs an array
  // update body against the order the DATABASE returns rows for the filter,
  // which is unspecified — so a 100-row chunk wrote each product's cost onto
  // whichever row happened to occupy that position, corrupting the catalog.
  // Each request here carries one row's values and one id, so there is nothing
  // to mispair.
  for (let i = 0; i < toUpdate.length; i += WRITE_CONCURRENCY) {
    const chunk = toUpdate.slice(i, i + WRITE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((row) => database.from("products").update(refreshPayload(row)).eq("id", row.id)),
    );
    for (const { error } of results) {
      if (error) throw new Error(`Update failed: ${error.message}`);
    }
  }

  let deactivated = 0;
  if (seenIds.length > 0) {
    const seen = new Set(seenIds);
    const staleIds = (existingRows ?? [])
      .map((row) => row.safka_product_id)
      .filter((id) => id && !seen.has(id));

    for (let i = 0; i < staleIds.length; i += 100) {
      const chunk = staleIds.slice(i, i + 100);
      const { error } = await database
        .from("products")
        .update({ status: "inactive" })
        .in("safka_product_id", chunk);
      if (error) throw new Error(`Deactivate failed: ${error.message}`);
    }
    deactivated = staleIds.length;
  }

  console.log(`Synced ${seenIds.length} of ${totalItems} Safka products`);
  console.log(`Inserted ${toInsert.length} new (unpublished), refreshed ${toUpdate.length} existing`);
  console.log(`Cost changes ${costChanged}, deactivated ${deactivated} stale products\n`);
  console.log(seenIds.length === totalItems ? "SYNC COMPLETE\n" : "SYNC PARTIAL\n");
  process.exit(seenIds.length === totalItems ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nSync failed: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});