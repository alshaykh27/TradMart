import { WhatsAppIcon } from "@/components/icons";

/**
 * Floating WhatsApp button, bottom corner on every storefront page.
 *
 * Rendered from the Footer (which already reads the social settings), so no
 * page has to opt in and the admin panel stays clean. The Footer only renders
 * it when a wa.me link exists, so an unconfigured number means no button at
 * all rather than a dead one.
 *
 * `bottom-20` until lg: the product page's sticky mobile buy bar owns
 * `bottom-0 z-40` below that breakpoint, and the button must stay reachable
 * above it. `end-4` follows the RTL direction (bottom-right in Arabic).
 */
export default function WhatsAppFab({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="fixed bottom-20 end-4 z-40 grid size-14 place-items-center rounded-full bg-success text-white shadow-lift ring-4 ring-white/70 transition-transform hover:-translate-y-1 lg:bottom-6 lg:end-6"
    >
      <WhatsAppIcon size={28} />
    </a>
  );
}
