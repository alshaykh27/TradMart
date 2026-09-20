import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import HeroEntrance from "@/components/home/HeroEntrance";
import HeroVisual from "@/components/hero/HeroVisual";
import { createClient } from "@/lib/supabase/server";
import { defaultLocale, getDictionary } from "@/i18n";

function TrustIcon({ kind }: { kind: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "cash":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M6 10.5v.01M18 13.5v.01" />
        </svg>
      );
    case "truck":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
          <circle cx="7" cy="17" r="1.8" />
          <circle cx="17" cy="17" r="1.8" />
        </svg>
      );
    case "return":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 8h10a4 4 0 0 1 0 8H9" />
          <path d="M7 5 4 8l3 3" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-hidden="true">
          <path d="M21 11.5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1z" />
          <path d="M8 18.5v2M16 18.5v2M9 6.5h6M8 3.5h8" />
        </svg>
      );
  }
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default async function Home() {
  const dict = getDictionary(defaultLocale);
  const client = await createClient();

  const { data: latest } = await client
    .from("products")
    .select("id, name, price, image_url, stock, updated_at")
    .eq("is_published", true)
    .order("updated_at", { ascending: false })
    .limit(8);

  const products = (latest ?? []).map((product) => ({
    ...product,
    isNew: daysSince(product.updated_at) <= 30,
  }));

  const trustRows: { icon: string; label: string }[] = [
    { icon: "cash", label: dict.home.trust.cod },
    { icon: "truck", label: dict.home.trust.fast },
    { icon: "return", label: dict.home.trust.returns },
    { icon: "chat", label: dict.home.trust.whatsapp },
  ];

  const whyIcons = ["tag", "shield", "phone"] as const;

  return (
    <>
      <Header dict={dict} />

      <main className="flex flex-1 flex-col">
        {/* ---------------------------------------------------------- hero */}
        <section className="mesh-hero relative overflow-hidden">
          <div
            className="absolute -start-16 top-16 size-56 rounded-full bg-brand/15 blur-3xl animate-float-slow"
            aria-hidden="true"
          />
          <div
            className="absolute end-8 bottom-8 size-64 rounded-full bg-success/15 blur-3xl animate-float"
            aria-hidden="true"
          />
          <div
            className="absolute start-1/2 top-8 size-24 rounded-full bg-brand/10 blur-2xl"
            aria-hidden="true"
          />

          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-24">
            <HeroEntrance dict={dict} />
            <div className="relative">
              <HeroVisual />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- trust row */}
        <section className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <ul className="grid grid-cols-2 gap-3 -mt-6 sm:grid-cols-4 lg:-mt-8">
            {trustRows.map((row) => (
              <li
                key={row.icon}
                className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3.5 shadow-soft"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                  <TrustIcon kind={row.icon} />
                </span>
                <span className="text-[13px] font-bold leading-tight text-slate-800">
                  {row.label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------------- categories */}
        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-extrabold tracking-tight text-navy sm:text-2xl">
              {dict.home.categories.label}
            </h2>
            <Link
              href="/products"
              className="text-sm font-bold text-brand transition-colors hover:text-brand-dark"
            >
              {dict.home.cta.browse}
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            {dict.home.categories.items.map((category) => (
              <Link
                key={category}
                href="/products"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand hover:text-brand"
              >
                {category}
              </Link>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------- latest products */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-navy sm:text-2xl">
                {dict.home.latest.label}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{dict.home.latest.subtitle}</p>
            </div>
            <Link
              href="/products"
              className="shrink-0 rounded-full bg-navy px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand"
            >
              {dict.home.latest.viewAll}
            </Link>
          </div>

          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {products.map((product, index) => (
              <li key={product.id} className="flex">
                <ProductCard product={product} dict={dict} index={index} />
              </li>
            ))}
          </ul>
        </section>

        {/* -------------------------------------------------- why us */}
        <section className="bg-cream">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
                {dict.home.why.label}
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 sm:text-base">
                {dict.home.why.subtitle}
              </p>
            </div>

            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {dict.home.why.items.map((item, index) => (
                <li
                  key={item.title}
                  className="rounded-card border border-slate-200/70 bg-white p-6 shadow-soft transition-shadow hover:shadow-lift"
                >
                  <span className="grid size-11 place-items-center rounded-2xl bg-navy text-white">
                    <TrustIcon kind={whyIcons[index % whyIcons.length]} />
                  </span>
                  <h3 className="mt-4 text-lg font-extrabold text-navy">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------ banner */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-card bg-navy px-6 py-12 text-center">
            <div
              className="absolute -start-10 -top-10 size-40 rounded-full bg-brand/30 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-12 end-10 size-48 rounded-full bg-success/20 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
                {dict.home.banner.title}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-cream/70 sm:text-base">
                {dict.home.banner.desc}
              </p>
              <Link
                href="/products"
                className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-9 text-base font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
              >
                {dict.home.cta.shopNow}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}