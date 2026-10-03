import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCategory, buildCategoryRow } from "@/lib/admin/category";
import { uniqueSlug } from "@/lib/products/category";

const SELECT_COLUMNS = "id, name_ar, slug, icon, display_order";

/**
 * GET /api/admin/categories — the category list for the admin dropdowns.
 * POST /api/admin/categories — create one inline ("+ قسم جديد").
 *
 * The storefront reads `categories` straight from Postgres on the anon key
 * (anon has SELECT), so this route exists only for the admin panel.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("categories")
    .select(SELECT_COLUMNS)
    .order("display_order")
    .order("name_ar");

  if (error) {
    return NextResponse.json({ ok: false, error: "تعذّر تحميل الأقسام" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, categories: data ?? [] });
}

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

  const built = buildCategory(body);
  if (!built.ok) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 422 });
  }

  const admin = createAdminClient();

  // New sections go to the end of the chip row.
  const { data: existing, error: existingError } = await admin
    .from("categories")
    .select("slug, display_order");
  if (existingError) {
    return NextResponse.json({ ok: false, error: "تعذّر تحميل الأقسام" }, { status: 502 });
  }

  const taken = (existing ?? []).map((row) => row.slug);
  const orders = (existing ?? []).map((row) => Number(row.display_order) || 0);
  const nextOrder = (orders.length > 0 ? Math.max(...orders) : 0) + 10;

  const slug = uniqueSlug(built.value.slug, taken);

  const { data, error } = await admin
    .from("categories")
    .insert(buildCategoryRow({ ...built.value, slug }, nextOrder))
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // 23505 = unique violation. Only reachable if another request inserted the
    // same slug between our read and our write.
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "يوجد قسم بنفس الرابط — اختر رابطًا آخر" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: "تعذّر إنشاء القسم" }, { status: 502 });
  }

  // Tell the caller we de-duplicated, so the admin form can show the real slug.
  return NextResponse.json({
    ok: true,
    category: data,
    slugAdjusted: slug !== built.value.slug,
  });
}
