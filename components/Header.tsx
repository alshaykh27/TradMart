import Link from "next/link";
import type { Dictionary } from "@/i18n";

export default function Header({ dict }: { dict: Dictionary }) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
            T
          </span>
          <span className="text-xl font-bold tracking-tight text-slate-900">
            {dict.brand}
          </span>
        </Link>

        <nav
          aria-label={dict.brand}
          className="flex items-center gap-5 text-sm font-medium text-slate-600 sm:gap-8"
        >
          <Link href="/" className="transition-colors hover:text-emerald-700">
            {dict.nav.home}
          </Link>
          <Link
            href="/products"
            className="transition-colors hover:text-emerald-700"
          >
            {dict.nav.products}
          </Link>
        </nav>
      </div>
    </header>
  );
}
