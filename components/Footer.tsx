import Link from "next/link";
import type { Dictionary } from "@/i18n";

const SOCIALS: { label: string; path: string }[] = [
  {
    label: "Facebook",
    path: "M13.5 9H15V6.5h-1.5c-1.93 0-3.5 1.57-3.5 3.5V11H8v2.5h2v4.5h2.5v-4.5h2.5L15.5 11H12.5v-1a1 1 0 0 1 1-1Z",
  },
  {
    label: "Instagram",
    path: "M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25Zm0 6A2.25 2.25 0 1 1 12 9.75a2.25 2.25 0 0 1 0 4.5ZM16.75 7.9a.9.9 0 1 1-1.8 0 .9.9 0 0 1 1.8 0ZM12 5.5c-1.77 0-1.99.01-2.68.04-.66.03-1.12.15-1.51.31-.4.17-.74.4-1.08.74-.34.34-.57.68-.74 1.08-.16.39-.28.85-.31 1.51-.03.69-.04.91-.04 2.68s.01 1.99.04 2.68c.03.66.15 1.12.31 1.51.17.4.4.74.74 1.08.34.34.68.57 1.08.74.39.16.85.28 1.51.31.69.03.91.04 2.68.04s1.99-.01 2.68-.04c.66-.03 1.12-.15 1.51-.31.4-.17.74-.4 1.08-.74.34-.34.57-.68.74-1.08.16-.39.28-.85.31-1.51.03-.69.04-.91.04-2.68s-.01-1.99-.04-2.68c-.03-.66-.15-1.12-.31-1.51a2.9 2.9 0 0 0-.74-1.08 2.9 2.9 0 0 0-1.08-.74c-.39-.16-.85-.28-1.51-.31C13.99 5.51 13.77 5.5 12 5.5Zm0-1.5c1.8 0 2.03.01 2.74.04.71.03 1.2.14 1.62.31.44.17.81.4 1.18.77.37.37.6.74.77 1.18.17.42.28.91.31 1.62.03.71.04.94.04 2.74s-.01 2.03-.04 2.74c-.03.71-.14 1.2-.31 1.62a3.2 3.2 0 0 1-.77 1.18 3.2 3.2 0 0 1-1.18.77c-.42.17-.91.28-1.62.31-.71.03-.94.04-2.74.04s-2.03-.01-2.74-.04c-.71-.03-1.2-.14-1.62-.31a3.2 3.2 0 0 1-1.18-.77 3.2 3.2 0 0 1-.77-1.18c-.17-.42-.28-.91-.31-1.62-.03-.71-.04-.94-.04-2.74s.01-2.03.04-2.74c.03-.71.14-1.2.31-1.62.17-.44.4-.81.77-1.18.37-.37.74-.6 1.18-.77.42-.17.91-.28 1.62-.31.71-.03.94-.04 2.74-.04Z",
  },
  {
    label: "TikTok",
    path: "M19.5 7.9a5.2 5.2 0 0 1-2.89-.9 5.3 5.3 0 0 1-2.09-3.1h-2.6v10.88a2.12 2.12 0 1 1-1.55-2.03V10a4.7 4.7 0 1 0 4.15 4.42V8.66a7.6 7.6 0 0 0 4.98 1.77V7.9Z",
  },
  {
    label: "WhatsApp",
    path: "M12.04 4.5a7.5 7.5 0 0 0-6.37 11.3L5 20l4.3-1.13a7.48 7.48 0 1 0 2.74-14.37Zm0 1.5a6 6 0 1 1-3.05 11.16l-.31-.18-2.55.67.68-2.48-.2-.32A6 6 0 0 1 12.04 6Zm-2.7 3.05c-.13 0-.34.05-.52.26-.18.2-.69.67-.69 1.64 0 .97.7 1.9.8 2.03.1.13 1.36 2.18 3.36 2.97 1.66.66 2 .53 2.36.5.36-.03 1.16-.48 1.33-.93.17-.46.17-.85.12-.93-.05-.08-.18-.13-.38-.23-.2-.1-1.17-.57-1.35-.64-.18-.07-.31-.1-.44.1-.13.2-.5.63-.62.76-.11.13-.23.14-.43.05a5.4 5.4 0 0 1-2.71-2.68c-.2-.53.2-.55.57-.73l.26-.37c.07-.14.03-.27-.02-.37-.04-.1-.57-1.38-.79-1.88-.2-.5-.41-.43-.57-.44Z",
  },
];

export default function Footer({ dict }: { dict: Dictionary }) {
  return (
    <footer className="bg-navy text-cream">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <p className="text-xl font-extrabold tracking-tight">
            <span className="text-brand">Trade</span>Mart
          </p>
          <p className="mt-3 max-w-xs text-sm leading-7 text-cream/70">{dict.footer.blurb}</p>
        </div>

        <nav aria-label={dict.footer.quick}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-cream/50">
            {dict.footer.quick}
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <Link href="/" className="text-cream/85 transition-colors hover:text-brand">
                {dict.nav.home}
              </Link>
            </li>
            <li>
              <Link href="/products" className="text-cream/85 transition-colors hover:text-brand">
                {dict.nav.products}
              </Link>
            </li>
            <li>
              <Link href="/cart" className="text-cream/85 transition-colors hover:text-brand">
                {dict.nav.cart}
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-cream/50">
            {dict.footer.contact}
          </h2>
          <a
            href="#whatsapp"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-success/15 px-4 py-2 text-sm font-semibold text-success ring-1 ring-success/30 transition-colors hover:bg-success hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.04 4.5a7.5 7.5 0 0 0-6.37 11.3L5 20l4.3-1.13a7.48 7.48 0 1 0 2.74-14.37Z" />
            </svg>
            {dict.footer.whatsapp}
          </a>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-cream/50">
            {dict.footer.follow}
          </h2>
          <ul className="mt-4 flex gap-2">
            {SOCIALS.map((social) => (
              <li key={social.label}>
                <a
                  href="#social"
                  aria-label={social.label}
                  className="grid size-10 place-items-center rounded-full bg-white/10 text-cream/80 transition-all hover:-translate-y-0.5 hover:bg-brand hover:text-white"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d={social.path} />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-5">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 text-xs text-cream/50 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {dict.brand}. {dict.footer.rights}
          </p>
          <p className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            {dict.home.trust.cod}
          </p>
        </div>
      </div>
    </footer>
  );
}