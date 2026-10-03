import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import AddManualProduct from "@/components/admin/AddManualProduct";
import AdminProductList from "@/components/admin/AdminProductList";
import type { CategoryOption } from "@/lib/products/category";
import { buildProductSearchOrFilter } from "@/lib/products/category";

export const metadata: Metadata = {
  title: "المنتجات",
  robots: { index: false, follow: false },
};

const LIMIT = 50;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    source?: string;
    category?: string;
    page?: string;
    deleted?: string;
  }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  // 'manual' and 'safka' filter the list; anything else is ignored.
  const source = params.source === "manual" || params.source === "safka" ? params.source : "";
  // 'none' = not categorised yet, otherwise a category slug. This is the filter
  // that makes bulk-categorising the whole catalogue practical: work through
  // 'none' page by page until the count is zero.
  const category = typeof params.category === "string" ? params.category.trim() : "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  // Set by DeleteManualProductButton after a successful DELETE. The row that
  // owned the button is gone by now, so the message has to travel in the URL to
  // outlive the server re-render. Rendered as a plain React child (never
  // dangerouslySetInnerHTML) and length-capped, so it is escaped and bounded.
  const deleted = typeof params.deleted === "string" ? params.deleted.slice(0, 200) : "";

  // Preserve the active filters when clearing the banner or resetting the form.
  const filterSuffix = new URLSearchParams(
    Object.entries({ q, source, category }).filter(([, value]) => value) as [string, string][],
  ).toString();
  const listHref = filterSuffix ? `/admin/products?${filterSuffix}` : "/admin/products";

  const admin = createAdminClient();

  const { data: categoryRows, error: categoriesError } = await admin
    .from("categories")
    .select("id, name_ar, slug, icon, display_order")
    .order("display_order")
    .order("name_ar");

  const categories: CategoryOption[] = categoryRows ?? [];

  // Resolve the requested slug to an id once; an unknown slug is treated as "no
  // filter" rather than an error, so a deleted section cannot 500 the page.
  const categoryId =
    category && category !== "none"
      ? categories.find((option) => option.slug === category)?.id ?? null
      : null;

  let query = admin
    .from("products")
    .select(
      "id, name, description, price, cost_price, commission, is_published, status, safka_product_id, image_url, images, stock, source, category_id",
      { count: "exact" },
    )
    .order("is_published", { ascending: false })
    .order("created_at", { ascending: false });

  if (source) {
    query = query.eq("source", source);
  }

  if (category === "none") {
    query = query.is("category_id", null);
  } else if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (q) {
    // `.or()` takes a raw PostgREST filter string, so the term is validated and
    // its LIKE wildcards escaped by the builder. An unexpressible term (e.g.
    // one carrying `,` or `.`) degrades to "no filter" rather than erroring.
    const searchFilter = buildProductSearchOrFilter(q);
    if (searchFilter) {
      query = query.or(searchFilter);
    }
  }

  const from = (page - 1) * LIMIT;
  const { data: products, error, count } = await query.range(from, from + LIMIT - 1);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasPrev = page > 1;
  const hasNext = from + LIMIT < total;

  function pageHref(target: number): string {
    const search = new URLSearchParams(
      Object.entries({ q, source, category }).filter(([, value]) => value) as [string, string][],
    );
    if (target > 1) search.set("page", String(target));
    const queryString = search.toString();
    return queryString ? `/admin/products?${queryString}` : "/admin/products";
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">المنتجات</h1>
<p className="mt-1 text-sm text-navy-soft">
        المنتجات المزامنة من سافكا والمنتجات المضافة يدويًا· تعديل العمولة يعرض الربح
        والهامش فورًا.
      </p>
      {categoriesError ? (
        <p className="mt-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          تعذّر تحميل الأقسام — لم يُضف عمود <code dir="ltr">category_id</code> بعد.
        </p>
      ) : null}
      </header>

      <AddManualProduct categories={categories} />

      {deleted ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <span aria-hidden="true" className="font-bold">
            ✓
          </span>
          <p className="flex-1">
            تم حذف المنتج «{deleted}» وصوره المرفوعة نهائيًا.
          </p>
          <a
            href={listHref}
            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            إخفاء
          </a>
        </div>
      ) : null}

      <form method="get" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="بحث بالاسم أو كود سافكا أو الباركود…"
          className="w-full max-w-sm rounded-2xl border border-navy/15 bg-white px-4 py-2.5 text-navy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        <select
          name="source"
          defaultValue={source}
          className="rounded-2xl border border-navy/15 bg-white px-4 py-2.5 text-sm text-navy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
        >
          <option value="">كل المصادر</option>
          <option value="safka">من سافكا</option>
          <option value="manual">مضاف يدويًا</option>
        </select>
        <select
          name="category"
          defaultValue={category}
          className="rounded-2xl border border-navy/15 bg-white px-4 py-2.5 text-sm text-navy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
        >
          <option value="">كل الأقسام</option>
          <option value="none">بدون قسم</option>
          {categories.map((option) => (
            <option key={option.id} value={option.slug}>
              {option.name_ar}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-2xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-dark"
        >
          بحث
        </button>
        {q || source || category ? (
          <a
            href={listHref}
            className="flex items-center rounded-2xl border border-navy/15 px-4 text-sm text-navy-soft hover:bg-brand-soft"
          >
            مسح
          </a>
        ) : null}
      </form>

      {total > 0 ? (
        <p className="text-xs text-navy-soft">
          {total.toLocaleString("ar-EG")} منتج · صفحة {page.toLocaleString("ar-EG")} من{" "}
          {totalPages.toLocaleString("ar-EG")}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          تعذّر تحميل المنتجات.
        </p>
      ) : !products || products.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-navy-soft shadow-soft">
          {q || source || category
            ? "لا نتائج مطابقة للبحث."
            : "لا توجد منتجات بعد — شغّل مزامنة سافكا أو أضف منتجًا يدويًا."}
        </p>
      ) : (
        <>
          <AdminProductList products={products} categories={categories} />

          {totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-3" aria-label="تصفّح المنتجات">
              {hasPrev ? (
                <a
                  href={pageHref(page - 1)}
                  className="rounded-2xl border border-navy/15 px-4 py-2 text-sm font-semibold text-navy-soft transition hover:bg-brand-soft"
                >
                  → السابقة
                </a>
              ) : (
                <span />
              )}
              {hasNext ? (
                <a
                  href={pageHref(page + 1)}
                  className="rounded-2xl border border-navy/15 px-4 py-2 text-sm font-semibold text-navy-soft transition hover:bg-brand-soft"
                >
                  التالية ←
                </a>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}