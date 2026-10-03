import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/products/category";

/**
 * PATCH /api/admin/products/bulk — assigns one category to many products at
 * once, which is how the 446 already-synced products get categorised without
 * opening 446 editors.
 *
 * Explicitly allowed to cross the manual/Safka boundary: category_id is
 * merchant metadata that Safka does not know about, so a bulk assignment is
 * valid for both sources. It deliberately cannot touch price, cost, commission,
 * publish state or anything else — one column only, so there is no way for this
 * route to corrupt a synced row.
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

  const categoryId = body.category_id;
  let resolved: string | null;
  if (categoryId === null || categoryId === "") {
    resolved = null;
  } else if (isUuid(categoryId)) {
    resolved = (categoryId as string).trim();
  } else {
    return NextResponse.json(
      { ok: false, error: "القسم المحدد غير صالح" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .update({ category_id: resolved })
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
      { ok: false, error: "تعذّر تصنيف المنتجات" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    updated: data?.length ?? uniqueIds.length,
    requested: uniqueIds.length,
    category_id: resolved,
  });
}