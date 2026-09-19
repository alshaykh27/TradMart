import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { Json } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeProductHook } from "@/lib/safka/webhook";
import { sanitizeHtmlDescription } from "@/lib/sanitize";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function tokenMatches(token: string | undefined, expected: string | undefined): boolean {
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
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

    const { data, error } = await admin
      .from("products")
      .upsert(
        {
          safka_product_id: product.safka_product_id,
          name: product.name,
          description: product.description ? sanitizeHtmlDescription(product.description) : null,
          image_url: product.image_url,
          price: product.price,
          cost_price: product.cost_price,
          commission: product.commission,
          stock: product.stock,
          status: "active",
          is_published: true,
        },
        { onConflict: "safka_product_id" },
      )
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: "Could not save product" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null, received: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}