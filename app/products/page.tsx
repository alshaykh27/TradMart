import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { createClient } from "@/lib/supabase/server";
import { withFoldFallback } from "@/lib/products/fold-columns";
import { defaultLocale, getDictionary } from "@/i18n";
import { isValidSlug, escapeLikePattern } from "@/lib/products/category";

export const metadata: Metadata = {
  title: "المنتجات",
  description: "استعرض جميع المنتجات المتوفرة في متجر TradeMart.",
};

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export default async function ProductsPage({
  searchParams,
}: PageProps<"/products">) {
  const dict = getDictionary(defaultLocale);
  const client = await createClient();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  // The category filter is a slug from the URL. It is pattern-checked before it
  // is used, then resolved to a real id, so a hand-edited URL can never be
  // passed into a query filter as-is.
  const requestedSlug =
    typeof params.category === "string" && isValidSlug(params.category)
      ? params.category
      : "";

  const { data: categories } = await client
    .from("categories")
    .select("id, name_ar, slug, icon, display_order")
    .order("display_order")
    .order("name_ar");

  const selectedCategory =
    requestedSlug === ""
      ? null
      : (categories ?? []).find((category) => category.slug === requestedSlug) ?? null;

  // The filter runs in the database, after the slug has been resolved to a real
  // id. An unknown slug is treated as "no filter" so a stale bookmark still
  // shows the shop instead of an empty listing. The chain is written twice —
  // once with the fold columns and once without — so each Supabase query keeps
  // its literal column list (and inferred row type); only the first is normally
  // used.
  const { data, error } = await withFoldFallback(
    () => {
      let builder = client
        .from("products")
        .select("id, name, price, image_url, stock, updated_at, shipping_included, shipping_fold")
        .eq("is_published", true)
        .order("updated_at", { ascending: false });

      if (query) {
        // `.ilike()` takes a single value (no filter grammar to break out of),
        // but the LIKE wildcards are still neutralised so a search for "%"
        // cannot turn into a match-everything scan.
        builder = builder.ilike("name", `%${escapeLikePattern(query)}%`);
      }

      if (selectedCategory) {
        builder = builder.eq("category_id", selectedCategory.id);
      }

      return builder.limit(96);
    },
    () => {
      let builder = client
        .from("products")
        .select("id, name, price, image_url, stock, updated_at")
        .eq("is_published", true)
        .order("updated_at", { ascending: false });

      if (query) {
        builder = builder.ilike("name", `%${escapeLikePattern(query)}%`);
      }

      if (selectedCategory) {
        builder = builder.eq("category_id", selectedCategory.id);
      }

      return builder.limit(96);
    },
  );
  const products = (error ? [] : (data ?? [])).map((product) => ({
    ...product,
    isNew: daysSince(product.updated_at) <= 30,
  }));

  const listingHref = query ? `/products?q=${encodeURIComponent(query)}` : "/products";

  return (
    <>
      <Header dict={dict} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-navy">
                {query ? (
                  <>
                    {dict.products.title}{" "}
                    <span className="text-brand">«{query}»</span>
                  </>
                ) : selectedCategory ? (
                  <>
                    {dict.products.title} ·{" "}
                    <span className="text-brand">{selectedCategory.name_ar}</span>
                  </>
                ) : (
                  dict.products.title
                )}
              </h1>
              <p className="mt-2 text-slate-600">{dict.products.description}</p>
            </div>

            {(query || selectedCategory) && (
              <Link
                href="/products"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-brand hover:text-brand"
              >
                {dict.products.back}
              </Link>
            )}
          </header>

          {/* Category filter. A plain GET form so the choice is a shareable URL
              and the filtering stays on the server. */}
          {categories && categories.length > 0 ? (
            <form method="get" className="mb-6 flex flex-wrap items-center gap-2">
              {query ? <input type="hidden" name="q" value={query} /> : null}
              <label
                htmlFor="category"
                className="text-sm font-semibold text-navy-soft"
              >
                {dict.products.categoryLabel}
              </label>
              <select
                id="category"
                name="category"
                defaultValue={selectedCategory?.slug ?? ""}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
              >
                <option value="">{dict.products.allCategories}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.icon ? `${category.icon} ` : ""}
                    {category.name_ar}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-brand"
              >
                {dict.products.search}
              </button>
              {selectedCategory ? (
                <a
                  href={listingHref}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy-soft transition hover:border-brand hover:text-brand"
                >
                  {dict.products.clearCategory}
                </a>
              ) : null}
            </form>
          ) : null}

          {products.length === 0 ? (
            <div className="mx-auto max-w-md rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-soft">
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-brand-soft text-brand">
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
                  <path d="M3 8l9 5 9-5M12 13v8" />
                </svg>
              </div>
              <h2 className="mt-5 text-xl font-extrabold text-navy">
                {selectedCategory
                  ? dict.products.emptyCategoryTitle
                  : dict.products.emptyTitle}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {selectedCategory
                  ? dict.products.emptyCategoryHint
                  : dict.products.emptyHint}
              </p>
              {selectedCategory ? (
                <Link
                  href={listingHref}
                  className="mt-6 inline-flex h-10 items-center rounded-full bg-navy px-5 text-sm font-bold text-white transition hover:bg-brand"
                >
                  {dict.products.allCategories}
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
              {products.map((product, index) => (
                <li key={product.id} className="flex">
                  <ProductCard product={product} dict={dict} index={index} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}