"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "./CartProvider";
import type { Dictionary } from "@/i18n";

export default function CartButton({ dict }: { dict: Dictionary }) {
  const { count } = useCart();

  return (
    <motion.a
      href="/cart"
      aria-label={dict.nav.cart}
      className="relative grid size-10 place-items-center rounded-full text-slate-700 transition-colors hover:bg-brand-soft hover:text-brand"
      whileTap={{ scale: 0.92 }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 7h12l1.5 13.5a1 1 0 0 1-1 1.1H5.5a1 1 0 0 1-1-1.1L6 7Z" />
        <path d="M9 10V6a3 3 0 0 1 6 0v4" />
      </svg>

      <AnimatePresence>
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
            className="absolute -end-0.5 -top-0.5 grid size-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white shadow-glow"
          >
            {count > 99 ? "99+" : count}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.a>
  );
}