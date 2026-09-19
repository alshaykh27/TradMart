import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { createClient } from "@/lib/supabase/server";
import { defaultLocale, getDictionary } from "@/i18n";

export const metadata: Metadata = {
  title: "المنتجات",
  description: "استعرض جميع المنتجات المتوفرة في متجر TradeMart.",
};

export default async function ProductsPage() {
  const dict = getDictionary(defaultLocale);
  const client = await createClient();

  const { data, error } = await client
    .from("products")
    .select("id, name, price, image_url, stock")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(96);

  const products = error ? [] : (data ?? []);

  return (
    <>
      <Header dict={dict} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              {dict.products.title}
            </h1>
            <p className="mt-2 text-slate-600">{dict.products.description}</p>
          </header>

          {products.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <p className="text-slate-600">{dict.products.empty}</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
              {products.map((product) => (
                <li key={product.id} className="flex">
                  <ProductCard product={product} dict={dict} />
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