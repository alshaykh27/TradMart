import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { Json, TablesInsert } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeProductHook } from "@/lib/safka/webhook";
import { sanitizeHtmlDescription } from "@/lib/sanitize";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function tokenMatches(token: string | undefined, expected: string | undefined): boolean {
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function toJsonArray(value: string[] | null): Json | null {
  return value && value.length > 0 ? (value as Json) : null;
}

export async function POST(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? undefined;
    if (!tokenMatches(token, WEBHOOK_SECRET)) {
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

    const row: TablesInsert<"products"> = {
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
    };

    let targetId: string | null = null;

    if (product.safka_product_id) {
      const byId = await admin
        .from("products")
        .select("id")
        .eq("safka_product_id", product.safka_product_id)
        .maybeSingle();
      if (!byId.error && byId.data?.id) targetId = byId.data.id;
    }

    if (!targetId && product.barcode) {
      const byBarcode = await admin
        .from("products")
        .select("id")
        .eq("barcode", product.barcode)
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