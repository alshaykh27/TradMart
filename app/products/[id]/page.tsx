import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import ProductGallery from "@/components/ProductGallery";
import OrderNowButton from "@/components/OrderNowButton";
import { createClient } from "@/lib/supabase/server";
import { sanitizeHtmlDescription } from "@/lib/sanitize";
import { defaultLocale, getDictionary } from "@/i18n";

type ProductPageProps = PageProps<"/products/[id]">;

type VariantLike = {
  key?: string | null;
  value?: number | null;
  is_available?: boolean;
};

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

const DELIVERY_ICON = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const client = await createClient();

  const { data } = await client
    .from("products")
    .select("name")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();

  return {
    title: data?.name ?? "المنتج",
    description: "تفاصيل المنتج",
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const dict = getDictionary(defaultLocale);
  const client = await createClient();

  const { data: product, error } = await client
    .from("products")
    .select("id, name, description, price, image_url, stock, is_published, images, variants, updated_at")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !product) {
    notFound();
  }

  const description = sanitizeHtmlDescription(product.description);
  const formattedPrice = Number(product.price).toLocaleString("ar-EG", {
    maximumFractionDigits: 2,
  });
  const unavailable = (product.stock ?? 0) <= 0;

  const galleryImages = Array.isArray(product.images)
    ? (product.images as unknown as string[]).filter(
        (url): url is string => typeof url === "string" && /^https?:\/\/.+/.test(url),
      )
    : [];
  if (galleryImages.length === 0 && product.image_url) galleryImages.push(product.image_url);

  const variants =
    Array.isArray(product.variants) && product.variants.length > 0
      ? (product.variants as unknown as VariantLike[])
      : [];

  const { data: relatedData } = await client
    .from("products")
    .select("id, name, price, image_url, stock, updated_at")
    .eq("is_published", true)
    .neq("id", id)
    .order("updated_at", { ascending: false })
    .limit(4);

  const related = (relatedData ?? []).map((item) => ({
    ...item,
    isNew: daysSince(item.updated_at) <= 30,
  }));

  return (
    <>
      <Header dict={dict} />

      <main className="flex-1 pb-28 lg:pb-0">
        <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <nav aria-label={dict.products.title}>
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-brand"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                className="rtl:-scale-x-100"
                aria-hidden="true"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              {dict.products.back}
            </Link>
          </nav>

          <article className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <ProductGallery images={galleryImages} alt={product.name} dict={dict} />
            </div>

            <div className="lg:sticky lg:top-28 lg:self-start">
              <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl lg:text-[2rem]">
                {product.name}
              </h1>

              <div className="mt-4 flex items-center gap-3">
                <p className="text-[26px] font-extrabold text-brand sm:text-3xl">
                  {formattedPrice}
                  <span className="ms-2 text-sm font-medium text-slate-500">
                    {dict.products.currency}
                  </span>
                </p>
                {unavailable && (
                  <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {dict.products.notAvailable}
                  </span>
                )}
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <OrderNowButton productId={product.id} dict={dict} full={false} />
                <OrderNowButton
                  productId={product.id}
                  dict={dict}
                  variant="ghost"
                  full={false}
                />
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft">
                <h2 className="text-lg font-extrabold text-navy">
                  {dict.products.delivery.title}
                </h2>
                <ul className="mt-4 flex flex-col gap-3.5">
                  {[
                    {
                      icon: (
                        <svg {...DELIVERY_ICON} aria-hidden="true">
                          <rect x="2" y="6" width="20" height="12" rx="2" />
                          <circle cx="12" cy="12" r="2.6" />
                        </svg>
                      ),
                      text: dict.products.delivery.cash,
                    },
                    {
                      icon: (
                        <svg {...DELIVERY_ICON} aria-hidden="true">
                          <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
                          <circle cx="7" cy="17" r="1.8" />
                          <circle cx="17" cy="17" r="1.8" />
                        </svg>
                      ),
                      text: dict.products.delivery.shipping,
                    },
                    {
                      icon: (
                        <svg {...DELIVERY_ICON} aria-hidden="true">
                          <path d="M4 8h10a4 4 0 0 1 0 8H9" />
                          <path d="M7 5 4 8l3 3" />
                        </svg>
                      ),
                      text: dict.products.delivery.returns,
                    },
                  ].map((row) => (
                    <li key={row.text} className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                        {row.icon}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{row.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {variants.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-lg font-extrabold text-navy">{dict.products.variants}</h2>
                  <ul className="mt-3 flex flex-col gap-2">
                    {variants.map((variant, index) => (
                      <li
                        key={variant.key ?? index}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
                      >
                        <span className="text-sm font-semibold text-slate-800">
                          {variant.key ?? "—"}
                        </span>
                        <span
                          className={`text-sm font-bold ${
                            variant.is_available === false ? "text-rose-600" : "text-success"
                          }`}
                        >
                          {variant.is_available === false
                            ? dict.products.notAvailable
                            : dict.products.available}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </article>

          {description && (
            <div className="mt-10 lg:mt-12">
              <h2 className="text-xl font-extrabold tracking-tight text-navy sm:text-2xl">
                {dict.products.description}
              </h2>
              <div
                className="mt-4 max-w-3xl rounded-2xl border border-slate-200/70 bg-white p-6 leading-7 text-slate-700 shadow-soft [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold [&_strong]:font-bold [&_a]:text-brand [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            </div>
          )}
        </section>

        {related.length > 0 && (
          <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-extrabold tracking-tight text-navy sm:text-2xl">
                {dict.products.related}
              </h2>
              <Link
                href="/products"
                className="shrink-0 text-sm font-bold text-brand transition-colors hover:text-brand-dark"
              >
                {dict.home.latest.viewAll}
              </Link>
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
              {related.map((item, index) => (
                <li key={item.id} className="flex">
                  <ProductCard product={item} dict={dict} index={index} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* Sticky mobile buy bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-soft backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <p className="whitespace-nowrap text-lg font-extrabold text-brand">
            {formattedPrice}
            <span className="ms-1.5 text-xs font-medium text-slate-500">
              {dict.products.currency}
            </span>
          </p>
          <div className="flex-1">
            <OrderNowButton productId={product.id} dict={dict} full />
          </div>
        </div>
      </div>

      <Footer dict={dict} />
    </>
  );
}