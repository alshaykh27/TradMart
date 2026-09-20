import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { createClient } from "@/lib/supabase/server";
import { defaultLocale, getDictionary } from "@/i18n";

export const metadata: Metadata = {
  title: "المنتجات",
  description: "استعرض جميع المنتجات المتوفرة في متجر TradeMart.",
};

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default async function ProductsPage({
  searchParams,
}: PageProps<"/products">) {
  const dict = getDictionary(defaultLocale);
  const client = await createClient();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";

  let builder = client
    .from("products")
    .select("id, name, price, image_url, stock, updated_at")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (query) {
    builder = builder.ilike("name", `%${query}%`);
  }

  const { data, error } = await builder.limit(96);
  const products = (error ? [] : (data ?? [])).map((product) => ({
    ...product,
    isNew: daysSince(product.updated_at) <= 30,
  }));

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
                ) : (
                  dict.products.title
                )}
              </h1>
              <p className="mt-2 text-slate-600">{dict.products.description}</p>
            </div>

            {query && (
              <Link
                href="/products"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-brand hover:text-brand"
              >
                {dict.products.back}
              </Link>
            )}
          </header>

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
                {dict.products.emptyTitle}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {dict.products.emptyHint}
              </p>
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