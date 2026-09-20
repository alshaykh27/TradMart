"use client";

import { MotionConfig } from "framer-motion";
import { CartProvider } from "@/components/cart/CartProvider";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <CartProvider>{children}</CartProvider>
    </MotionConfig>
  );
}