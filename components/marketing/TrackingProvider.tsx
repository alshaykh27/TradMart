"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackMarketingEvent } from "@/lib/marketing/browser";

/**
 * Fires PageView on every client-side navigation.
 *
 * The vendor snippets in PixelScripts already fire the first PageView when the
 * initial page loads, so this component deliberately skips its own first run —
 * otherwise the landing page would be counted twice, which quietly inflates
 * every reported metric.
 *
 * Keyed on the pathname only, deliberately: `useSearchParams()` in the root
 * layout would force a Suspense boundary around the whole app. A ?category=
 * change on /products is a filter, not a new page, so not counting it is also
 * the more correct behaviour.
 */
export default function TrackingProvider() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastPath.current === null) {
      // First render: the pixel snippet already sent the initial PageView.
      lastPath.current = pathname;
      return;
    }

    if (lastPath.current === pathname) return;

    lastPath.current = pathname;
    trackMarketingEvent("PageView");
  }, [pathname]);

  return null;
}
