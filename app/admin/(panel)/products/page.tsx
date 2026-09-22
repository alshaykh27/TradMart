import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import ProductRow, { type AdminProduct } from "@/components/admin/ProductRow";

export const metadata: Metadata = {
  title: "المنتجات",
  robots: { index: false, follow: false },
};

const LIMIT = 50;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const admin = createAdminClient();

  let query = admin
    .from("products")
    .select(
      "id, name, price, cost_price, commission, is_published, status, safka_product_id, image_url, stock",
    )
    .order("is_published", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,safka_product_id.ilike.%${q}%,barcode.ilike.%${q}%`,
    );
  }

  const { data: products, error } = await query;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">المنتجات</h1>
        <p className="mt-1 text-sm text-navy-soft">
          كل المنتجات المزامنة (منشورة وغير منشورة)· تعديل العمولة يعرض الربح
          والهامش فورًا.
        </p>
      </header>

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="بحث بالاسم أو كود سافكا أو الباركود…"
          className="w-full max-w-sm rounded-2xl border border-navy/15 bg-white px-4 py-2.5 text-navy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        <button
          type="submit"
          className="rounded-2xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-dark"
        >
          بحث
        </button>
        {q ? (
          <a
            href="/admin/products"
            className="flex items-center rounded-2xl border border-navy/15 px-4 text-sm text-navy-soft hover:bg-brand-soft"
          >
            مسح
          </a>
        ) : null}
      </form>

      {error ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          تعذّر تحميل المنتجات.
        </p>
      ) : !products || products.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-navy-soft shadow-soft">
          {q ? "لا نتائج مطابقة للبحث." : "لا توجد منتجات بعد — شغّل مزامنة سافكا."}
        </p>
      ) : (
        <ul className="space-y-3">
          {products.map((product) => (
            <li key={product.id}>
              <ProductRow product={product as AdminProduct} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}