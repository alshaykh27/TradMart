import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** PATCH /api/admin/products/[id] — publish toggle and/or commission edit. */
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

  const update: { is_published?: boolean; commission?: number | null } = {};

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

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "لا شيء لتحديثه" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .update(update)
    .eq("id", id)
    .select(
      "id, name, price, cost_price, commission, is_published, status, safka_product_id, image_url, stock",
    )
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "المنتج غير موجود" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: data });
}