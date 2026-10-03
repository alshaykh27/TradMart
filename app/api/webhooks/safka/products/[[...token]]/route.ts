import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { Json, TablesInsert } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeProductHook } from "@/lib/safka/webhook";
import { sanitizeHtmlDescription } from "@/lib/sanitize";
import { checkRateLimit, getClientIp } from "@/lib/orders/rate-limit";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

/**
 * Abuse ceiling, checked BEFORE the secret compare so an unauthenticated flood
 * costs nothing more than a map lookup (no DB round-trip, no JSON parse, no
 * constant-time compare). The shared secret remains the real authorisation;
 * this only bounds how fast one caller can burn CPU or fill `webhook_logs`.
 *
 * Product hooks arrive in bursts when Safka bulk-syncs a catalogue, so the
 * ceiling is deliberately generous — this is a DoS/abuse backstop, not a quota.
 */
const WEBHOOK_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

/**
 * Compare in constant time. Whitespace is trimmed so a trailing newline/space
 * in the Safka-side URL never causes a spurious 401.
 */
function secretMatches(token: string | undefined, expected: string | undefined): boolean {
  if (!token || !expected) return false;
  const candidate = token.trim();
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

/**
 * Accept the token either as a query string (?token=...) or as a path segment
 * (/api/webhooks/safka/products/<token>). The path segment is URL-decoded
 * before the constant-time compare; the query value is already decoded by
 * URLSearchParams.
 */
async function extractToken(
  request: Request,
  segments: string[] | undefined,
): Promise<string | undefined> {
  const queryToken = new URL(request.url).searchParams.get("token");
  if (queryToken) return queryToken;

  const raw = segments && segments.length > 0 ? segments[0] : undefined;
  if (!raw) return undefined;

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function toJsonArray(value: string[] | null): Json | null {
  return value && value.length > 0 ? (value as Json) : null;
}

export async function POST(request: Request, context: { params: Promise<{ token?: string[] }> }) {
  const rate = checkRateLimit(`safka-webhook:${getClientIp(request)}`, WEBHOOK_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const { token: segments } = await context.params;
    const token = await extractToken(request, segments);
    if (!secretMatches(token, WEBHOOK_SECRET)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.text();
    if (!rawBody) {
      return NextResponse.json({ ok: false, error: "Empty body" }, { status: 400 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const admin = createAdminClient();

    await admin.from("webhook_logs").insert({ payload: payload as Json });

    const product = normalizeProductHook(payload);
    if (!product) {
      return NextResponse.json({ ok: false, error: "Unrecognized payload shape" }, { status: 422 });
    }

    // category_id is deliberately absent and must stay that way: Safka sends no
    // category, so the storefront section is merchant metadata assigned in
    // /admin/products. Including it here — or adding it to this row — would make
    // every incoming hook wipe the merchant's categorisation. Preserved because
    // both the .update() and the .upsert() below send only these columns.
    //
    // `satisfies` rather than a type annotation: this one object is sent to both
    // .upsert() (needs Insert) and .update() (needs Update, which has no `id`),
    // and the inferred literal type is assignable to both.
    const row = {
      safka_product_id: product.safka_product_id,
      barcode: product.barcode,
      name: product.name,
      description: product.description ? sanitizeHtmlDescription(product.description) : null,
      image_url: product.image_url,
      images: toJsonArray(product.images),
      variants: product.variants ? (product.variants as unknown as Json) : null,
      media_url: product.media_url,
      price: product.price,
      cost_price: product.cost_price,
      commission: product.commission,
      stock: product.stock,
      status: product.status,
      is_published: true,
      source: "safka",
    } satisfies TablesInsert<"products">;

    // Lookups are restricted to source <> 'manual': a hand-written product
    // must never be claimed by an incoming hook, or a colliding barcode would
    // overwrite it and force-publish it.
    let targetId: string | null = null;

    if (product.safka_product_id) {
      const byId = await admin
        .from("products")
        .select("id")
        .eq("safka_product_id", product.safka_product_id)
        .neq("source", "manual")
        .maybeSingle();
      if (!byId.error && byId.data?.id) targetId = byId.data.id;
    }

    if (!targetId && product.barcode) {
      const byBarcode = await admin
        .from("products")
        .select("id")
        .eq("barcode", product.barcode)
        .neq("source", "manual")
        .maybeSingle();
      if (!byBarcode.error && byBarcode.data?.id) targetId = byBarcode.data.id;
    }

    let savedId: string | null = null;

    if (targetId) {
      const { data, error } = await admin
        .from("products")
        .update(row)
        .eq("id", targetId)
        .select("id")
        .single();
      if (error) {
        return NextResponse.json({ ok: false, error: "Could not save product" }, { status: 502 });
      }
      savedId = data?.id ?? targetId;
    } else {
      const { data, error } = await admin
        .from("products")
        .upsert(row, { onConflict: "safka_product_id" })
        .select("id")
        .single();
      if (error) {
        return NextResponse.json({ ok: false, error: "Could not save product" }, { status: 502 });
      }
      savedId = data?.id ?? null;
    }

    return NextResponse.json({ ok: true, id: savedId, received: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}