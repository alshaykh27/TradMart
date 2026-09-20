import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductGallery from "@/components/ProductGallery";
import { createClient } from "@/lib/supabase/server";
import { sanitizeHtmlDescription } from "@/lib/sanitize";
import { defaultLocale, getDictionary } from "@/i18n";

type ProductPageProps = PageProps<"/products/[id]">;

type VariantLike = {
  key?: string | null;
  value?: number | null;
  is_available?: boolean;
};

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
    .select("id, name, description, price, image_url, stock, is_published, images, variants")
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

  return (
    <>
      <Header dict={dict} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <nav aria-label={dict.products.title}>
            <Link
              href="/products"
              className="inline-block text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
            >
              {dict.products.back}
            </Link>
          </nav>

          <article className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="relative aspect-square overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
              {galleryImages.length > 0 ? (
                <ProductGallery images={galleryImages} alt={product.name} dict={dict} />
              ) : product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center text-6xl font-bold text-emerald-600">
                  {dict.brand.slice(0, 1)}
                </div>
              )}
            </div>

            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                {product.name}
              </h1>

              <p className="mt-4 text-2xl font-bold text-emerald-700 sm:text-3xl">
                {formattedPrice}
                <span className="ms-2 text-sm font-medium text-slate-500">
                  {dict.products.currency}
                </span>
              </p>

              {unavailable && (
                <p className="mt-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {dict.products.notAvailable}
                </p>
              )}

              {description && (
                <div
                  className="mt-8 text-slate-700 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold [&_strong]:font-bold"
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              )}

              {variants.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-lg font-bold text-slate-900">{dict.products.variants}</h2>
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
                          className={`text-sm font-semibold ${
                            variant.is_available === false ? "text-rose-600" : "text-emerald-700"
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
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}