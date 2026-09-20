import Link from "next/link";
import type { Dictionary } from "@/i18n";
import MobileMenu from "@/components/MobileMenu";
import CartButton from "@/components/cart/CartButton";

function Logo({ dict }: { dict: Dictionary }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={dict.brand}>
      <span className="grid size-10 place-items-center rounded-2xl bg-brand text-white shadow-glow">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 7h12l1.5 13.5a1 1 0 0 1-1 1.1H5.5a1 1 0 0 1-1-1.1L6 7Z" />
          <path d="M9 10V6a3 3 0 0 1 6 0v4" />
        </svg>
      </span>
      <span className="text-xl font-extrabold tracking-tight text-navy">
        <span className="text-brand">Trade</span>Mart
      </span>
    </Link>
  );
}

function SearchForm({ dict }: { dict: Dictionary }) {
  return (
    <form
      action="/products"
      method="get"
      role="search"
      className="group relative flex w-full items-center"
    >
      <label className="sr-only" htmlFor="site-search">
        {dict.nav.search}
      </label>
      <input
        id="site-search"
        name="q"
        type="search"
        placeholder={dict.nav.search}
        className="h-11 w-full rounded-full border border-slate-200 bg-white ps-5 pe-12 text-sm text-slate-800 outline-none transition group-focus-within:border-brand group-focus-within:ring-4 group-focus-within:ring-brand/15"
      />
      <button
        type="submit"
        aria-label={dict.nav.search}
        className="absolute end-1.5 grid size-9 place-items-center rounded-full bg-navy text-white transition-colors hover:bg-brand"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </form>
  );
}

export default function Header({ dict }: { dict: Dictionary }) {
  return (
    <header className="sticky top-0 z-50">
      <div className="bg-navy px-4 py-2 text-center text-[13px] font-medium text-cream/90">
        <span className="inline-flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          {dict.announcement}
        </span>
      </div>

      <div className="glass border-b border-slate-200/70">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <MobileMenu dict={dict} />

          <Logo dict={dict} />

          <div className="hidden flex-1 max-w-xl md:block">
            <SearchForm dict={dict} />
          </div>

          <nav
            aria-label={dict.brand}
            className="ms-auto hidden items-center gap-6 text-sm font-semibold text-slate-700 lg:flex"
          >
            <Link href="/" className="transition-colors hover:text-brand">
              {dict.nav.home}
            </Link>
            <Link href="/products" className="transition-colors hover:text-brand">
              {dict.nav.products}
            </Link>
          </nav>

          <CartButton dict={dict} />
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pb-3 md:hidden">
          <SearchForm dict={dict} />
        </div>
      </div>
    </header>
  );
}