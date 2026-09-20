"use client";

import { useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { useCart } from "@/components/cart/CartProvider";
import type { Dictionary } from "@/i18n";

type CardProduct = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  stock: number | null;
  isNew?: boolean;
};

function noopSubscribe(): () => void {
  return () => {};
}

/**
 * "Can tilt" is decided only after hydration (server snapshot is false), so the
 * style prop never differs between the server HTML and the client's first
 * render — otherwise hydration would flag the added perspective() transform.
 */
function finePointer(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(pointer: coarse)").matches;
}

export default function ProductCard({
  product,
  dict,
  index = 0,
}: {
  product: CardProduct;
  dict: Dictionary;
  index?: number;
}) {
  const { add } = useCart();
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 300, damping: 24 });
  const sry = useSpring(ry, { stiffness: 300, damping: 24 });

  const canTilt = useSyncExternalStore(noopSubscribe, finePointer, () => false);
  const tiltEnabled = !reducedMotion && canTilt;

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!tiltEnabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    ry.set(px * 9);
    rx.set(-py * 9);
  };

  const resetTilt = () => {
    rx.set(0);
    ry.set(0);
  };

  const formattedPrice = product.price.toLocaleString("ar-EG", {
    maximumFractionDigits: 2,
  });
  const unavailable = (product.stock ?? 0) <= 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: (index % 8) * 0.05, ease: "easeOut" }}
      onMouseMove={handleMove}
      onMouseLeave={resetTilt}
      style={tiltEnabled ? { rotateX: srx, rotateY: sry, transformPerspective: 800 } : undefined}
      className="group h-full"
    >
      <motion.div
        whileHover={{ y: -6 }}
        whileTap={{ scale: 0.985 }}
        className="flex h-full flex-col overflow-hidden rounded-card border border-slate-200/80 bg-white shadow-soft transition-shadow hover:shadow-lift"
      >
        <Link href={`/products/${product.id}`} className="flex flex-1 flex-col">
          <div className="relative aspect-square overflow-hidden bg-slate-100">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-110"
              />
            ) : (
              <div className="grid size-full place-items-center text-5xl font-bold text-emerald-600">
                {dict.brand.slice(0, 1)}
              </div>
            )}

            {product.isNew && !unavailable && (
              <span className="absolute start-3 top-3 rounded-full bg-brand px-3 py-1 text-[11px] font-bold text-white shadow-glow">
                {dict.products.newBadge}
              </span>
            )}

            {unavailable && (
              <span className="absolute start-3 top-3 rounded-full bg-navy/85 px-3 py-1 text-[11px] font-bold text-white">
                {dict.products.notAvailable}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2 p-4">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 transition-colors group-hover:text-brand sm:text-base">
              {product.name}
            </h3>

            <p className="mt-auto flex items-baseline gap-1.5">
              <span className="text-lg font-extrabold text-brand sm:text-xl">{formattedPrice}</span>
              <span className="text-xs font-medium text-slate-500">{dict.products.currency}</span>
            </p>
          </div>
        </Link>

        <div className="px-4 pb-4 pt-0 opacity-100 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => add(product.id, 1)}
            disabled={unavailable}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-navy py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {dict.products.addToCart}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}