/**
 * TradeMart — Safka product sync (Phase 2).
 *
 * Fetches every product from the Safka Public API and upserts it into the
 * Supabase `products` table using the service-role client (bypasses RLS,
 * server-only operation). Products that exist locally but are no longer
 * returned by Safka are deactivated rather than deleted.
 *
 * Run: npm run sync:products
 *
 * Requires .env.local with SAFKA_API_BASE_URL, SAFKA_API_KEY,
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Secrets are never printed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SafkaProduct, SafkaProductList } from "../types/safka";

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

function mapProduct(product: SafkaProduct) {
  const available =
    (product.is_active ?? false) &&
    ((product.properties?.length ?? 0) === 0 ||
      (product.properties ?? []).some((property) => property.is_available));

  return {
    safka_product_id: product._id,
    name: product.name,
    description: product.description ?? null,
    price: Number(product.sale_price ?? 0),
    image_url: product.image ?? product.images?.[0] ?? null,
    stock: available ? 1 : 0,
    status: product.is_active ? "active" : "inactive",
  };
}

async function main() {
  console.log("\nSafka product sync\n");

  const database = admin();
  const seenIds: string[] = [];
  let synced = 0;
  let page = 1;
  let totalItems = 0;

  do {
    const list = await fetchPage(page, PAGE_SIZE);
    totalItems = list.totalItems;

    const rows = list.data.map(mapProduct);
    for (const row of rows) {
      seenIds.push(row.safka_product_id);
    }

    const { error } = await database
      .from("products")
      .upsert(rows, { onConflict: "safka_product_id" });
    if (error) throw new Error(`Upsert failed: ${error.message}`);

    synced += rows.length;
    page += 1;
    if (page > list.pages) break;
  } while (synced < totalItems);

  let deactivated = 0;
  if (seenIds.length > 0) {
    const { data: local, error: localError } = await database
      .from("products")
      .select("safka_product_id");

    if (localError) throw new Error(`Local lookup failed: ${localError.message}`);

    const seen = new Set(seenIds);
    const staleIds = (local ?? [])
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

  console.log(`Synced ${synced} of ${totalItems} Safka products`);
  console.log(`Deactivated ${deactivated} stale products\n`);
  console.log(synced === totalItems ? "SYNC COMPLETE\n" : "SYNC PARTIAL\n");
  process.exit(synced === totalItems ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nSync failed: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});