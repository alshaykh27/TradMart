"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { Dictionary } from "@/i18n";

function noopSubscribe(): () => void {
  return () => {};
}

function supportsHoverZoom(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export default function ProductGallery({
  images,
  alt,
  dict,
}: {
  images: string[];
  alt: string;
  dict: Dictionary;
}) {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [magnify, setMagnify] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const hoverZoom = useSyncExternalStore(noopSubscribe, supportsHoverZoom, () => false);

  if (images.length === 0) return null;

  const pics = images;
  const current = pics[Math.min(active, pics.length - 1)];

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hoverZoom) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  };

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-square overflow-hidden rounded-3xl border border-slate-200 bg-slate-100"
        onMouseEnter={() => hoverZoom && setMagnify(true)}
        onMouseLeave={() => {
          setMagnify(false);
          setOrigin("50% 50%");
        }}
        onMouseMove={handleMove}
      >
        {!loaded && <div className="skeleton absolute inset-0" aria-hidden="true" />}
        <Image
          src={current}
          alt={alt}
          fill
          priority={active === 0}
          sizes="(min-width: 1024px) 46vw, 100vw"
          onLoad={() => setLoaded(true)}
          className={`object-cover transition duration-300 ${
            magnify ? "scale-[1.7]" : "scale-100"
          } ${loaded ? "opacity-100" : "opacity-0"}`}
          style={{ transformOrigin: origin }}
        />
      </div>

      {pics.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={dict.products.gallery}>
          {pics.slice(0, 8).map((pic, index) => {
            const isActive = index === Math.min(active, pics.length - 1);
            return (
              <motion.button
                key={pic}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`${dict.products.gallery} ${index + 1}`}
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  setActive(index);
                  setLoaded(false);
                }}
                className={`relative size-16 overflow-hidden rounded-xl border-2 transition-colors ${
                  isActive ? "border-brand" : "border-transparent hover:border-brand/50"
                }`}
              >
                <Image
                  src={pic}
                  alt={`${alt} ${index + 1}`}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}