"use client";

import { motion } from "framer-motion";
import { useCart } from "@/components/cart/CartProvider";
import type { Dictionary } from "@/i18n";

export default function OrderNowButton({
  productId,
  dict,
  variant = "primary",
  full = false,
}: {
  productId: string;
  dict: Dictionary;
  variant?: "primary" | "ghost";
  full?: boolean;
}) {
  const { add } = useCart();

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={() => add(productId, 1)}
      className={
        variant === "primary"
          ? `inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-7 text-base font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${
              full ? "w-full" : ""
            }`
          : `inline-flex h-12 items-center justify-center gap-2 rounded-full border border-navy/15 bg-white px-7 text-base font-bold text-navy transition-colors hover:border-navy ${
              full ? "w-full" : ""
            }`
      }
    >
      {variant === "primary" ? dict.products.orderNow : dict.products.addToCart}
    </motion.button>
  );
}