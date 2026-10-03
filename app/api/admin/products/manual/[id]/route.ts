import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeHtmlDescription } from "@/lib/sanitize";
import { buildManualProductPatch } from "@/lib/admin/manual-product";
import {
  managedImageKeys,
  PRODUCT_IMAGE_BUCKET,
} from "@/lib/products/manual";
import type { Tables } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

type ManualProductRow = Pick<
  Tables<"products">,
  | "id"
  | "name"
  | "price"
  | "cost_price"
  | "commission"
  | "stock"
  | "is_published"
  | "status"
  | "source"
  | "category_id"
  | "image_url"
  | "images"
>;

const SELECT_COLUMNS =
  "id, name, price, cost_price, commission, stock, is_published, status, source, category_id, image_url, images";

type ManualLookup =
  | { ok: true; admin: AdminClient; product: ManualProductRow }
  | { ok: false; admin: AdminClient; status: number; error: string };

/**
 * Loads a product and refuses to touch it unless it was created by hand.
 * Safka rows are edited only through PATCH /api/admin/products/[id], which
 * whitelists just commission and is_published — this route is the full editor,
 * so it must never be able to rewrite a synced row.
 */
async function loadManualProduct(id: string): Promise<ManualLookup> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, admin, status: 502, error: "تعذّر تحميل المنتج" };
  }
  if (!data) {
    return { ok: false, admin, status: 404, error: "المنتج غير موجود" };
  }
  if (data.source !== "manual") {
    return {
      ok: false,
      admin,
      status: 409,
      error: "هذا منتج مُزامن من سافكا — لا يمكن تعديله يدويًا",
    };
  }
  return { ok: true, admin, product: data };
}

/** PUT /api/admin/products/manual/[id] — full edit of a manual product. */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const loaded = await loadManualProduct(id);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });
  }

  const built = buildManualProductPatch(body, sanitizeHtmlDescription);
  if (!built.ok) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 422 });
  }

  // source and safka_product_id are intentionally absent from the patch: a
  // manual product can neither become a Safka row nor gain a Safka id.
  const { data, error } = await loaded.admin
    .from("products")
    .update(built.value)
    .eq("id", id)
    .eq("source", "manual")
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "تعذّر حفظ التعديلات" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, product: data });
}

/** DELETE /api/admin/products/manual/[id] — removes a manual product. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await context.params;
  const loaded = await loadManualProduct(id);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });
  }

  const { image_url, images } = loaded.product;
  const urls = [image_url, ...(Array.isArray(images) ? images : [])];
  const keys = managedImageKeys(urls, PRODUCT_IMAGE_BUCKET);

  const { error } = await loaded.admin
    .from("products")
    .delete()
    .eq("id", id)
    .eq("source", "manual")
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ ok: false, error: "المنتج غير موجود" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "تعذّر حذف المنتج" }, { status: 502 });
  }

  // Storage cleanup is best-effort: the product row is already gone, and an
  // orphaned object is far less harmful than a failed delete.
  if (keys.length > 0) {
    const { error: storageError } = await loaded.admin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .remove(keys);
    if (storageError) {
      console.warn(
        `[manual-product] deleted ${id} but could not remove ${keys.length} uploaded image(s)`,
      );
    }
  }

  return NextResponse.json({ ok: true, deletedImages: keys.length });
}