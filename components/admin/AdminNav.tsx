"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/admin", label: "الرئيسية" },
  { href: "/admin/orders", label: "الطلبات" },
  { href: "/admin/products", label: "المنتجات" },
  { href: "/admin/settings", label: "الإعدادات" },
  { href: "/admin/settings/marketing", label: "التسويق" },
  { href: "/admin/settings/social", label: "التواصل" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
    }
  }

  // Longest-prefix wins, so /admin/settings/marketing lights up only
  // "التسويق" and not "الإعدادات" as well.
  const activeHref = LINKS.filter(
    (link) => link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href),
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <header className="sticky top-0 z-20 border-b border-navy/10 bg-white/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="flex shrink-0 items-center gap-2 text-base font-extrabold tracking-tight">
          <span className="inline-block h-3 w-3 rounded-full bg-brand" />
          <span className="text-navy">لوحة تحكم TradeMart</span>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
className={
              link.href === activeHref
                ? "whitespace-nowrap rounded-full bg-brand px-3 py-1.5 font-semibold text-white"
                : "whitespace-nowrap rounded-full px-3 py-1.5 text-navy-soft hover:bg-brand-soft hover:text-navy"
            }
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="whitespace-nowrap rounded-full border border-rose-200 px-3 py-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            {busy ? "جارٍ الخروج…" : "خروج"}
          </button>
        </nav>
      </div>
    </header>
  );
}