"use client";

import { useEffect, useRef } from "react";
import { trackMarketingEvent } from "@/lib/marketing/browser";

/**
 * Fires ViewContent once per product page view.
 *
 * Rendered on the product detail page with that product's id, name and price.
 * The ref guard matters: React 18 StrictMode double-invokes effects in
 * development, and a naive effect would send ViewContent twice per visit and
 * inflate the metric.
 */
export default function TrackViewContent({
  productId,
  productName,
  price,
}: {
  productId: string;
  productName: string;
  price: number;
}) {
  const tracked = useRef<string | null>(null);

  useEffect(() => {
    if (tracked.current === productId) return;
    tracked.current = productId;

    trackMarketingEvent("ViewContent", {
      contentIds: [productId],
      contentNames: [productName],
      value: price,
    });
  }, [productId, productName, price]);

  return null;
}
