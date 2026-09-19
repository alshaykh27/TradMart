import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { defaultLocale, getDictionary } from "@/i18n";

export default function Home() {
  const dict = getDictionary(defaultLocale);

  return (
    <>
      <Header dict={dict} />

      <main className="flex flex-1 flex-col">
        <section className="flex flex-1 items-center justify-center px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
              {dict.brand}
              <span className="mt-3 block text-2xl font-bold text-emerald-700 sm:text-4xl">
                {dict.tagline}
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              {dict.home.description}
            </p>

            <Link
              href="/products"
              className="mt-10 inline-flex h-12 items-center justify-center rounded-full bg-emerald-600 px-8 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              {dict.home.browseProducts}
            </Link>
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
