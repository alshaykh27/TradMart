import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/products/category";
import { deriveSyncedPrice, MAX_SHIPPING_FOLD } from "@/lib/products/pricing";
import {
  isMissingFoldColumns,
  withFoldFallback,
  withoutFoldKeys,
} from "@/lib/products/fold-columns";
import { SETTINGS_ID } from "@/lib/settings";

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
    shipping_included?: boolean;
    shipping_fold?: number | null;
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

  // --- "free shipping" fold (display-only, never touches price) -------------
  if ("shippingIncluded" in body) {
    if (typeof body.shippingIncluded !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "قيمة shippingIncluded غير صالحة" },
        { status: 422 },
      );
    }
    update.shipping_included = body.shippingIncluded;
  }

  if ("shippingFold" in body) {
    const fold = body.shippingFold;
    if (fold === null) {
      update.shipping_fold = null;
    } else if (typeof fold === "number" && Number.isFinite(fold)) {
      if (fold < 0 || fold > MAX_SHIPPING_FOLD) {
        return NextResponse.json(
          { ok: false, error: "الشحن المضمّن خارج النطاق" },
          { status: 422 },
        );
      }
      update.shipping_fold = Math.round(fold * 100) / 100;
    } else {
      return NextResponse.json(
        { ok: false, error: "الشحن المضمّن غير صالح" },
        { status: 422 },
      );
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "لا شيء لتحديثه" }, { status: 422 });
  }

  const admin = createAdminClient();

  // The fold and the toggle must travel together: enabling without a value in
  // the body resolves the flat default from settings; disabling always clears
  // whatever fold was stored. Either way `price` is never part of this — the
  // fold exists only in the two display columns.
  if ("shipping_included" in update) {
    if (update.shipping_included) {
      if (update.shipping_fold == null) {
        const { data: settings, error: settingsError } = await withFoldFallback(
          () =>
            admin
              .from("settings")
              .select("shipping_fold_default")
              .eq("id", SETTINGS_ID)
              .maybeSingle(),
          () =>
            admin
              .from("settings")
              .select("id, shipping_markup")
              .eq("id", SETTINGS_ID)
              .maybeSingle(),
        );

        // Before the fold migration lands there is no shipping_fold_default
        // column, so the settings read returns 42703. Degrade to the same flat
        // default the storefront uses; once the column exists the stored value
        // applies and a missing/unset default stays an explicit refusal.
        let fallback = Number(settings?.shipping_fold_default);
        if (isMissingFoldColumns(settingsError)) {
          fallback = 85;
        } else if (!Number.isFinite(fallback) || fallback <= 0) {
          return NextResponse.json(
            { ok: false, error: "حدّد قيمة الشحن المضمّن أو اضبط الافتراضي في الإعدادات" },
            { status: 422 },
          );
        }
        update.shipping_fold = Math.round(fallback * 100) / 100;
      }
    } else {
      update.shipping_fold = null;
    }
  }

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

  const fullColumns: string =
    "id, name, price, cost_price, commission, is_published, status, safka_product_id, image_url, stock, source, category_id, shipping_included, shipping_fold";
  const baseColumns: string =
    "id, name, price, cost_price, commission, is_published, status, safka_product_id, image_url, stock, source, category_id";

  let result = await admin
    .from("products")
    .update(update)
    .eq("id", id)
    .select(fullColumns)
    .maybeSingle();

  if (isMissingFoldColumns(result.error)) {
    // The fold columns are not in the schema yet: run the same write against the
    // base columns. A fold-only change then has nothing left to write, so it is
    // refused rather than silently dropped.
    const basePayload = withoutFoldKeys(update);
    if (Object.keys(basePayload).length === 0) {
      return NextResponse.json({ ok: false, error: "لا شيء لتحديثه" }, { status: 422 });
    }
    result = await admin
      .from("products")
      .update(basePayload)
      .eq("id", id)
      .select(baseColumns)
      .maybeSingle();
  }

  const data = result.data;
  if (result.error || !data) {
    return NextResponse.json({ ok: false, error: "المنتج غير موجود" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: data });
}