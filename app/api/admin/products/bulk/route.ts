import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/products/category";

/**
 * PATCH /api/admin/products/bulk — applies ONE action to a hand-picked set of
 * products, so the merchant does not have to open 446 editors.
 *
 * Exactly one of two actions per request, never both:
 *   - `category_id`  assign or clear a section
 *   - `is_published` publish or unpublish
 * Requiring exactly one is deliberate: a body carrying both could set a section
 * and the publish state in a single write, which is two decisions the merchant
 * never made together.
 *
 * Scope rules, both enforced here rather than trusted from the client:
 *   - `ids` is required, must be 1..MAX_IDS, must be unique, and every entry
 *     must be a UUID. There is no "all products" or "everything matching this
 *     filter" form — a bulk write can only ever address rows the caller listed
 *     by id, so a filter can never widen the blast radius by accident.
 *   - No other column is writable. Price, cost, commission and stock stay
 *     off-limits, so this route cannot corrupt a synced row.
 *
 * category_id is allowed to cross the manual/Safka boundary: a section is
 * merchant metadata that Safka does not know about. is_published is the same
 * column the per-row toggle writes, and is deliberately NOT sent by the sync
 * (unpublished rows are skipped) or by the category-only caller, so neither can
 * change publish state through this route.
 */
const MAX_IDS = 100;

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS) {
    return NextResponse.json(
      { ok: false, error: `اختر من 1 إلى ${MAX_IDS} منتجًا` },
      { status: 422 },
    );
  }
  // De-duplicate so a double-click cannot send the same row twice, and reject
  // anything that is not an id rather than trusting the shape of the array.
  const uniqueIds = [...new Set(ids.filter((id): id is string => isUuid(id)))];
  if (uniqueIds.length === 0 || uniqueIds.length !== ids.length) {
    return NextResponse.json(
      { ok: false, error: "قائمة المنتجات غير صالحة" },
      { status: 422 },
    );
  }

  const wantsCategory = "category_id" in body;
  const wantsPublish = "is_published" in body;
  if (wantsCategory === wantsPublish) {
    return NextResponse.json(
      { ok: false, error: "حدّد إجراءً واحدًا: القسم أو حالة النشر" },
      { status: 422 },
    );
  }

  const update: { category_id?: string | null; is_published?: boolean } = {};

  if (wantsCategory) {
    const categoryId = body.category_id;
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
  } else {
    if (typeof body.is_published !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "قيمة is_published غير صالحة" },
        { status: 422 },
      );
    }
    update.is_published = body.is_published;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .update(update)
    .in("id", uniqueIds)
    .select("id");

  if (error) {
    // 23503 = foreign key violation: the section was deleted between the list
    // render and this request.
    if (error.code === "23503") {
      return NextResponse.json(
        { ok: false, error: "القسم لم يعد موجودًا" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "تعذّر تطبيق الإجراء على المنتجات" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    updated: data?.length ?? uniqueIds.length,
    requested: uniqueIds.length,
    ...update,
  });
}
