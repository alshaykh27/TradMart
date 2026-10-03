import { connection } from "next/server";
import { getPublicMarketingConfig } from "@/lib/marketing/settings";
import { isValidMetaPixelId, isValidTikTokPixelId } from "@/lib/marketing/config";

/**
 * Injects the Meta and TikTok browser pixels.
 *
 * This is the only place a Pixel ID reaches the browser, and it carries the ID
 * and nothing else — `getPublicMarketingConfig()` projects just the two IDs out
 * of settings, so an access token cannot be interpolated here even by mistake.
 *
 * The IDs are re-validated before being embedded. They are interpolated as JSON
 * literals and each snippet is only rendered for its own platform, so a platform
 * with nothing configured produces no script tag, no network request, and no
 * error — the snippet's own `fbq('track', 'PageView')` handles the first page
 * view, and components/marketing/TrackingProvider handles every later one.
 */

const META_BASE = "https://connect.facebook.net/en_US/fbevents.js";
const TIKTOK_BASE = "https://analytics.tiktok.com/i18n/pixel/events.js";

function metaSnippet(pixelId: string): string {
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=${JSON.stringify(META_BASE)};s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script');fbq('init',${JSON.stringify(pixelId)});fbq('track','PageView');`;
}

function tiktokSnippet(pixelId: string): string {
  return `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i=${JSON.stringify(TIKTOK_BASE)};ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i+"?sdkid="+e;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${JSON.stringify(pixelId)});ttq.page();}(window,document,'ttq');`;
}

export default async function PixelScripts() {
  // WITHOUT THIS, THE PIXEL ID WOULD BE FROZEN AT BUILD TIME.
  //
  // This component lives in the root layout, so it also renders for routes that
  // are otherwise prerendered (/cart and /admin/login were both static). Their
  // HTML would be baked during `next build`, freezing whatever Pixel IDs were
  // configured at that moment — the owner could then only change a pixel by
  // redeploying, which defeats the point of making it an admin setting.
  // `connection()` ends prerendering here, so the read below happens per request
  // and a change in /admin/settings/marketing takes effect on the next page view.
  await connection();

  const config = await getPublicMarketingConfig();

  const metaPixelId = isValidMetaPixelId(config.metaPixelId) ? config.metaPixelId : null;
  const tiktokPixelId = isValidTikTokPixelId(config.tiktokPixelId) ? config.tiktokPixelId : null;

  // Nothing configured for either platform: render no markup at all.
  if (!metaPixelId && !tiktokPixelId) {
    return null;
  }

  // A PLAIN INLINE <script>, NOT <Script> FROM next/script. THIS IS DELIBERATE.
  //
  // `next/script` was tried with both strategies and both are wrong here:
  //   * `afterInteractive` (its default) "injects [the script] into the HTML
  //     client-side" and runs it after hydration. Verified against served markup:
  //     the snippet existed only inside the self.__next_f RSC payload and no
  //     <script> element shipped at all, so the landing PageView was gated on
  //     React hydrating and never fired without JavaScript.
  //   * `beforeInteractive` does execute pre-hydration, but only via Next's
  //     self.__next_s bootstrap queue, it silently drops the `id` prop, and it
  //     trips @next/next/no-before-interactive-script-outside-document.
  //
  // A raw inline <script> is exactly what Meta and TikTok publish in their own
  // installation guides, so it is the vendor-sanctioned shape: it ships as a
  // real element in the initial HTML and runs while the document is parsed,
  // with no dependency on React or on Next internals.
  //
  // Safety is unchanged: this is a Server Component, the IDs were re-validated
  // and are embedded with JSON.stringify (so an ID cannot break out of the
  // string literal), and access tokens never reach this component at all.
  return (
    <>
      {metaPixelId ? (
        <script id="meta-pixel" dangerouslySetInnerHTML={{ __html: metaSnippet(metaPixelId) }} />
      ) : null}
      {tiktokPixelId ? (
        <script id="tiktok-pixel" dangerouslySetInnerHTML={{ __html: tiktokSnippet(tiktokPixelId) }} />
      ) : null}
    </>
  );
}
