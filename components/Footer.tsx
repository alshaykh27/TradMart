import type { ReactElement } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Dictionary } from "@/i18n";
import { getSocialSettings } from "@/lib/settings";
import { whatsappChatLink } from "@/lib/social/links";
import { FacebookIcon, WhatsAppIcon } from "@/components/icons";

type SocialIconEntry = {
  label: string;
  href: string;
  icon: ReactElement;
};

export default async function Footer({ dict }: { dict: Dictionary }) {
  // WITHOUT THIS THE SOCIAL LINKS WOULD BE FROZEN AT BUILD TIME.
  //
  // This component renders on routes that are otherwise prerendered (/cart
  // among them), so a read without connection() would bake whatever links were
  // configured during `next build` — the owner could then only change a link
  // by redeploying, defeating the point of making it an admin setting. Same
  // reasoning as components/marketing/PixelScripts. The links below therefore
  // re-read on every request and an /admin/settings/social change takes effect
  // on the next page view.
  await connection();

  const social = await getSocialSettings();
  const whatsappHref = whatsappChatLink(social.whatsappNumber);

  const socialLinks: SocialIconEntry[] = [
    social.facebookUrl
      ? { label: "Facebook", href: social.facebookUrl, icon: <FacebookIcon /> }
      : null,
    whatsappHref ? { label: "WhatsApp", href: whatsappHref, icon: <WhatsAppIcon /> } : null,
  ].filter((entry): entry is SocialIconEntry => entry !== null);

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

        {whatsappHref ? (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-cream/50">
              {dict.footer.contact}
            </h2>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={dict.footer.whatsapp}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-success/15 px-4 py-2 text-sm font-semibold text-success ring-1 ring-success/30 transition-colors hover:bg-success hover:text-white"
            >
              <WhatsAppIcon size={16} />
              {dict.footer.whatsapp}
            </a>
          </div>
        ) : null}

        {socialLinks.length > 0 ? (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-cream/50">
              {dict.footer.follow}
            </h2>
            <ul className="mt-4 flex gap-2">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                    className="grid size-10 place-items-center rounded-full bg-white/10 text-cream/80 transition-all hover:-translate-y-0.5 hover:bg-brand hover:text-white"
                  >
                    {link.icon}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
