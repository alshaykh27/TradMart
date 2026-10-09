import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeHtmlDescription } from "@/lib/sanitize";
import { buildManualProduct } from "@/lib/admin/manual-product";
import { isMissingFoldColumns, withoutFoldKeys } from "@/lib/products/fold-columns";

/**
 * POST /api/admin/products/manual — creates a product by hand.
 *
 * The row is written with source = 'manual' and safka_product_id = null, which
 * is what keeps the Safka webhook and sync script away from it. The storefront
 * price is derived server-side from cost_price + commission; the client never
 * supplies a price.
 */
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const built = buildManualProduct(body, sanitizeHtmlDescription);
  if (!built.ok) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 422 });
  }

  const admin = createAdminClient();
  const selectColumns =
    "id, name, price, cost_price, commission, stock, is_published, status, source, category_id";

  let payload = built.value;
  let result = await admin
    .from("products")
    .insert(payload)
    .select(selectColumns)
    .single();

  if (isMissingFoldColumns(result.error)) {
    // The fold columns are not in the schema yet: write the product without
    // them so manual products can still be created on a pre-migration project.
    payload = withoutFoldKeys(payload);
    result = await admin
      .from("products")
      .insert(payload)
      .select(selectColumns)
      .single();
  }

  const { data, error } = result;

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "تعذّر حفظ المنتج" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, product: data }, { status: 201 });
}