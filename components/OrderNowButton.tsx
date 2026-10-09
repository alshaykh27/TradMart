"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { trackMarketingEvent } from "@/lib/marketing/browser";
import type { Dictionary } from "@/i18n";

export default function OrderNowButton({
  productId,
  dict,
  variant = "primary",
  full = false,
  mode = "buy",
  productName,
  price,
}: {
  productId: string;
  dict: Dictionary;
  variant?: "primary" | "ghost";
  full?: boolean;
  /**
   * "buy" (the default) is the express path: add the product then jump the
   * customer straight to the cart's checkout form. "add" only puts the product
   * in the cart and stays put.
   */
  mode?: "add" | "buy";
  /**
   * Optional product facts for the AddToCart event. The detail page passes
   * them; anywhere else (e.g. the sticky bar without props) the event still
   * fires, just without content names/value.
   */
  productName?: string;
  price?: number;
}) {
  const { add } = useCart();
  const router = useRouter();

  const isBuy = mode === "buy";

  function handleClick() {
    add(productId, 1);
    trackMarketingEvent("AddToCart", {
      contentIds: [productId],
      contentNames: productName ? [productName] : null,
      value: typeof price === "number" ? price : null,
      numItems: 1,
    });
    // "اطلب الآن" goes one step further than a plain add: land the customer on
    // the checkout form so they can complete the order without another click.
    if (isBuy) router.push("/cart#checkout");
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={handleClick}
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
      {isBuy ? dict.products.orderNow : dict.products.addToCart}
    </motion.button>
  );
}
