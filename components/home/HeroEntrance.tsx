"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { Dictionary } from "@/i18n";

const EASE = [0.22, 1, 0.36, 1] as const;

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export default function HeroEntrance({ dict }: { dict: Dictionary }) {
  return (
    <div className="relative z-10 text-center lg:text-start">
      <Muted>
        <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-soft px-4 py-1.5 text-sm font-semibold text-brand-dark">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
          {dict.home.hero.rest}
        </span>
      </Muted>

      <motion.h1
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.08, ease: EASE }}
        className="mt-5 text-4xl font-extrabold leading-[1.15] tracking-tight text-navy sm:text-5xl lg:text-6xl"
      >
        {dict.home.hero.title}
        <span className="mt-1 block text-brand">{dict.home.hero.highlight}</span>
      </motion.h1>

      <Muted>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg lg:mx-0 sm:mx-auto">
          {dict.home.hero.description}
        </p>
      </Muted>

      <Muted>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start sm:justify-center">
          <Link
            href="/products"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-8 text-base font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] sm:w-auto"
          >
            {dict.home.cta.shopNow}
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="rtl:-scale-x-100"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>

          <Link
            href="/products"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-8 text-base font-bold text-navy transition-colors hover:border-navy sm:w-auto"
          >
            {dict.home.cta.browse}
          </Link>
        </div>
      </Muted>
    </div>
  );
}