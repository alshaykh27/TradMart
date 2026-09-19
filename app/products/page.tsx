import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { defaultLocale, getDictionary } from "@/i18n";

export const metadata: Metadata = {
  title: "المنتجات",
  description: "استعرض جميع المنتجات المتوفرة في متجر TradeMart.",
};

export default function ProductsPage() {
  const dict = getDictionary(defaultLocale);

  return (
    <>
      <Header dict={dict} />

      <main className="flex flex-1 items-center justify-center px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-xl rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            {dict.products.title}
          </h1>
          <p className="mt-4 text-slate-600">{dict.products.comingSoon}</p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
          >
            {dict.nav.home}
          </Link>
        </div>
      </main>

      <Footer dict={dict} />
    </>
  );
}
