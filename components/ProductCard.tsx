import Image from "next/image";
import Link from "next/link";
import type { Dictionary } from "@/i18n";

type CardProduct = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  stock: number | null;
};

export default function ProductCard({
  product,
  dict,
}: {
  product: CardProduct;
  dict: Dictionary;
}) {
  const formattedPrice = product.price.toLocaleString("ar-EG", {
    maximumFractionDigits: 2,
  });

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid size-full place-items-center text-5xl font-bold text-emerald-600">
            {dict.brand.slice(0, 1)}
          </div>
        )}
        {(product.stock ?? 0) <= 0 && (
          <span className="absolute start-3 top-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-white">
            {dict.products.notAvailable}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 sm:text-base">
          {product.name}
        </h3>
        <p className="mt-auto text-base font-bold text-emerald-700 sm:text-lg">
          {formattedPrice}
          <span className="ms-1 text-xs font-medium text-slate-500">
            {dict.products.currency}
          </span>
        </p>
      </div>
    </Link>
  );
}