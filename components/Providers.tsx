"use client";

import { MotionConfig } from "framer-motion";
import { CartProvider } from "@/components/cart/CartProvider";
import TrackingProvider from "@/components/marketing/TrackingProvider";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <CartProvider>
        {/* PageView on every client-side navigation (the first one comes from
            the pixel snippet itself). Renders nothing. */}
        <TrackingProvider />
        {children}
      </CartProvider>
    </MotionConfig>
  );
}