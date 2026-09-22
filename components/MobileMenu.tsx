"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import type { Dictionary } from "@/i18n";

export default function MobileMenu({ dict }: { dict: Dictionary }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={dict.nav.menu}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid size-10 place-items-center rounded-full text-slate-700 transition-colors hover:bg-brand-soft hover:text-brand lg:hidden"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <path d="M6 6l12 12M18 6L6 18" />
            </>
          ) : (
            <>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </>
          )}
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-x-0 top-full border-t border-slate-100 bg-white/95 shadow-lift backdrop-blur lg:hidden"
          >
            <nav className="mx-auto max-w-6xl space-y-1 px-4 py-4" aria-label={dict.nav.menu}>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-3 text-base font-semibold text-slate-800 transition-colors hover:bg-brand-soft hover:text-brand"
              >
                {dict.nav.home}
              </Link>
              <Link
                href="/products"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-3 text-base font-semibold text-slate-800 transition-colors hover:bg-brand-soft hover:text-brand"
              >
                {dict.nav.products}
              </Link>
              <Link
                href="/cart"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-3 text-base font-semibold text-slate-800 transition-colors hover:bg-brand-soft hover:text-brand"
              >
                {dict.nav.cart}
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}