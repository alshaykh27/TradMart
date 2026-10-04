import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/products/category";
import { deriveSyncedPrice } from "@/lib/products/pricing";

/**
 * PATCH /api/admin/products/[id] — publish toggle, commission edit, and the
 * per-product category field for Safka-synced rows.
 *
 * category_id is only ever written when the key is present in the body, so the
 * publish toggle and commission editor (which do not send it) can never clear a
 * category. "no category" is sent as an explicit null.
 *
 * A commission is markup, so saving one re-derives `price` from the stored
 * cost_price (price = cost_price + commission) in the same write. The browser
 * never sends a price, exactly as with a manual product: the client cannot
 * decide the customer-facing price, the server derives it from the cost it
 * already holds. Without this the storefront keeps rendering the raw Safka
 * price and the markup silently does nothing.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const update: {
    is_published?: boolean;
    commission?: number | null;
    category_id?: string | null;
    /** Server-derived only — never read from the request body. */
    price?: number;
  } = {};

  if ("is_published" in body) {
    if (typeof body.is_published !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "قيمة is_published غير صالحة" },
        { status: 422 },
      );
    }
    update.is_published = body.is_published;
  }

  if ("commission" in body) {
    const commission = body.commission;
    if (commission === null) {
      update.commission = null;
    } else if (typeof commission === "number" && Number.isFinite(commission)) {
      if (commission < 0 || commission > 100_000) {
        return NextResponse.json(
          { ok: false, error: "العمولة خارج النطاق" },
          { status: 422 },
        );
      }
      update.commission = Math.round(commission * 100) / 100;
    } else {
      return NextResponse.json(
        { ok: false, error: "العمولة غير صالحة" },
        { status: 422 },
      );
    }
  }

  if ("category_id" in body) {
    const categoryId = body.category_id;

    // Explicit null clears the category; a UUID must reference a real section.
    if (categoryId === null || categoryId === "") {
      update.category_id = null;
    } else if (isUuid(categoryId)) {
      update.category_id = (categoryId as string).trim();
    } else {
      return NextResponse.json(
        { ok: false, error: "القسم المحدد غير صالح" },
        { status: 422 },
      );
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "لا شيء لتحديثه" }, { status: 422 });
  }

  const admin = createAdminClient();

  // Re-price whenever the commission changes. cost_price is the only input the
  // derivation needs, so it is read first rather than trusted from the body.
  if ("commission" in update) {
    const { data: current, error: currentError } = await admin
      .from("products")
      .select("cost_price")
      .eq("id", id)
      .maybeSingle();

    if (currentError || !current) {
      return NextResponse.json({ ok: false, error: "المنتج غير موجود" }, { status: 404 });
    }

    const price = deriveSyncedPrice(current.cost_price, update.commission);
    if (price === null) {
      // No cost means no base to add the markup to. Refuse rather than report
      // success while leaving the customer on the unmarked-up price.
      return NextResponse.json(
        { ok: false, error: "تكلفة المنتج غير مسجّلة، لا يمكن احتساب العمولة" },
        { status: 422 },
      );
    }

    update.price = price;
  }

  const { data, error } = await admin
    .from("products")
    .update(update)
    .eq("id", id)
    .select(
      "id, name, price, cost_price, commission, is_published, status, safka_product_id, image_url, stock, source, category_id",
    )
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "المنتج غير موجود" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: data });
}