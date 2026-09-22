/**
 * Safka governorate / shipping price-list sync (shared by the CLI script and
 * the hourly Vercel cron).
 *
 * Source of truth: GET /api/v1/public/price-list (Safka Public API docs). Each
 * active list = one governorate with a shipping fee. The create-order contract
 * sends `shipping_governorate` as this document `_id` (NOT a name), so the
 * rows are keyed by it and the checkout ships on Safka's real fee.
 *
 * The current rows are upserted into `governorate_pricing` (service role) and
 * rows that Safka no longer lists are removed, so the storefront can never
 * charge less than Safka actually charges.
 *
 * Deliberately free of "server-only": this runs both under Node (npm run
 * sync:governorates) and inside a Next.js route handler (the cron).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SafkaPriceListEntry } from "@/types/safka";

export type GovernorateSyncResult = {
  total: number;
  removed: number;
  cairo?: { governorate_id: string; name_ar: string; safka_shipping_fee: number };
};

function admin(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function syncGovernoratePricing(): Promise<GovernorateSyncResult> {
  const baseUrl = (process.env.SAFKA_API_BASE_URL || "").replace(/\/$/, "");
  const apiKey = process.env.SAFKA_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!baseUrl) missing.push("SAFKA_API_BASE_URL");
  if (!apiKey) missing.push("SAFKA_API_KEY");
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  const rows: {
    governorate_id: string;
    name_ar: string;
    name_en: string;
    safka_shipping_fee: number;
  }[] = [];

  let page = 1;
  let pages = 1;
  do {
    const response = await fetch(
      `${baseUrl}/api/v1/public/price-list?page=${page}&size=100`,
      {
        headers: { "api-safka-key": apiKey ?? "", Accept: "application/json" },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(`price-list request failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      success?: boolean;
      pages?: number;
      data?: SafkaPriceListEntry[];
    };
    if (body?.success !== true || !Array.isArray(body.data)) {
      throw new Error("Unexpected price-list response shape");
    }
    for (const entry of body.data) {
      if (entry.is_active !== true) continue;
      const nameAr = String(entry.governorateNameAr ?? "").trim();
      const governorateId = String(entry._id ?? "").trim();
      if (!governorateId || !nameAr) continue;
      rows.push({
        governorate_id: governorateId,
        name_ar: nameAr,
        name_en: String(entry.governorateName ?? "").trim(),
        safka_shipping_fee: Number(entry.price) || 0,
      });
    }
    pages = typeof body.pages === "number" && body.pages > 0 ? body.pages : 1;
    page += 1;
  } while (page <= pages);

  const seen = new Set(rows.map((row) => row.governorate_id));
  const database = admin(supabaseUrl as string, serviceRoleKey as string);

  if (rows.length > 0) {
    const { error } = await database
      .from("governorate_pricing")
      .upsert(rows, { onConflict: "governorate_id" });
    if (error) throw new Error(`governorate_pricing upsert failed: ${error.message}`);
  }

  const { data: existing, error: lookupError } = await database
    .from("governorate_pricing")
    .select("governorate_id");
  if (lookupError) throw new Error(`governorate_pricing lookup failed: ${lookupError.message}`);

  const stale = (existing ?? [])
    .map((row) => row.governorate_id)
    .filter((governorateId) => !seen.has(governorateId));

  for (let i = 0; i < stale.length; i += 100) {
    const chunk = stale.slice(i, i + 100);
    const { error } = await database
      .from("governorate_pricing")
      .delete()
      .in("governorate_id", chunk);
    if (error) throw new Error(`governorate_pricing delete failed: ${error.message}`);
  }

  const cairo = rows.find((row) => row.name_ar === "القاهرة") ?? null;

  return {
    total: rows.length,
    removed: stale.length,
    cairo: cairo
      ? {
          governorate_id: cairo.governorate_id,
          name_ar: cairo.name_ar,
          safka_shipping_fee: cairo.safka_shipping_fee,
        }
      : undefined,
  };
}