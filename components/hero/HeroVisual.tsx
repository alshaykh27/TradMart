"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

/**
 * Hero visual. Renders a real 3D gift box (via React Three Fiber) only on
 * desktop / capable devices, otherwise a lightweight CSS+CSS-animation
 * fallback. The 3D chunk is lazy-loaded client-side so it never blocks first
 * paint, and is skipped entirely when the user prefers reduced motion.
 */

const HeroBox3D = dynamic(() => import("./HeroBox3D"), {
  ssr: false,
  loading: () => null,
});

function FallbackBox() {
  return (
    <div className="relative aspect-square w-full">
      <motion.div
        className="absolute inset-0 grid place-items-center"
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="relative">
          <div className="h-36 w-44 rounded-2xl bg-gradient-to-br from-brand to-brand-dark shadow-lift">
            <div className="absolute inset-x-0 top-6 mx-auto h-3 w-32 rounded bg-white/70" />
            <div className="absolute inset-y-0 start-1/2 w-3 -translate-x-1/2 rounded bg-white/70" />
          </div>
          <div className="absolute -top-5 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full bg-white/80 shadow-md" />
          <div className="mx-auto mt-6 h-3 w-52 rounded-full bg-navy/15 blur-sm" />
        </div>
      </motion.div>

      <motion.div
        className="absolute -start-2 top-8 size-10 rounded-full bg-success/25 blur-sm"
        animate={{ y: [0, -10, 0], x: [0, 6, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      />
      <motion.div
        className="absolute end-2 bottom-10 size-14 rounded-2xl bg-brand/25 blur-sm"
        animate={{ y: [0, 12, 0], x: [0, -6, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      />
    </div>
  );
}

function noopSubscribe(): () => void {
  return () => {};
}

/**
 * Hydration-safe capability check: the server snapshot is always "fallback",
 * so the server HTML never disagrees with the client's first render. The real
 * capability is read via getSnapshot() only after hydration, which React uses
 * to re-render (without errors) when it differs from the server snapshot.
 */
function supports3d(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return (
    window.matchMedia("(pointer: fine)").matches &&
    (navigator.hardwareConcurrency ?? 8) > 4
  );
}

export default function HeroVisual() {
  const show3d = useSyncExternalStore(noopSubscribe, supports3d, () => false);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]">
      {show3d ? (
        <HeroBox3D />
      ) : (
        <div className="h-full">
          <FallbackBox />
        </div>
      )}
    </div>
  );
}