/**
 * TradeMart — Safka product sync (Phase 2, updated in Phase 3.5.1).
 *
 * Fetches every product from the Safka Public API and seeds new products into
 * Supabase (is_published = false). Existing PUBLISHED products are refreshed
 * with ONLY cost_price, stock, status and the derived display price; their
 * commission and is_published are never touched (a webhook is the only source
 * that may change those). Cost changes are logged to stdout.
 *
 * Run: npm run sync:products
 *
 * Requires .env.local with SAFKA_API_BASE_URL, SAFKA_API_KEY,
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Secrets are never printed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SafkaProduct, SafkaProductList, SafkaProductProperty } from "../types/safka";

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

  const { data: existingRows, error: lookupError } = await database
    .from("products")
    .select("id, safka_product_id, barcode, is_published, commission, cost_price");
  if (lookupError) throw new Error(`Local lookup failed: ${lookupError.message}`);

  const bySafkaId = new Map<string, typeof existingRows[number]>();
  const byBarcode = new Map<string, typeof existingRows[number]>();
  for (const row of existingRows ?? []) {
    if (row.safka_product_id) bySafkaId.set(row.safka_product_id, row);
    if (row.barcode) byBarcode.set(row.barcode, row);
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];
  let costChanged = 0;

  for (const item of pages) {
    const existing = bySafkaId.get(item._id) ?? (item.barcode ? byBarcode.get(item.barcode) : undefined);

    if (!existing) {
      toInsert.push({
        safka_product_id: item._id,
        barcode: item.barcode ?? null,
        name: item.name,
        description: item.description ?? null,
        image_url: item.image ?? item.images?.[0] ?? null,
        images: toGallery(item),
        variants: toVariants(item),
        price: Number(item.sale_price ?? 0),
        cost_price: null,
        commission: null,
        stock: computeStock(item),
        status: item.is_active ? "active" : "inactive",
        is_published: false,
      });
      continue;
    }

    if (existing.is_published !== true) continue;

    const newCost = Number(item.sale_price ?? 0);
    const newPrice =
      existing.commission !== null && existing.commission !== undefined
        ? Math.max(0, newCost + existing.commission)
        : newCost;

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

  for (let i = 0; i < toUpdate.length; i += 100) {
    const chunk = toUpdate.slice(i, i + 100);
    const ids = chunk.map((row) => row.id as string);
    const details = chunk.map((row) => ({
      cost_price: row.cost_price,
      price: row.price,
      stock: row.stock,
      status: row.status,
    }));
    const { error } = await database.from("products").update(details).in("id", ids);
    if (error) throw new Error(`Update failed: ${error.message}`);
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
  console.log(`Inserted ${toInsert.length} new (unpublished), refreshed ${toUpdate.length} published`);
  console.log(`Cost changes ${costChanged}, deactivated ${deactivated} stale products\n`);
  console.log(seenIds.length === totalItems ? "SYNC COMPLETE\n" : "SYNC PARTIAL\n");
  process.exit(seenIds.length === totalItems ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nSync failed: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});