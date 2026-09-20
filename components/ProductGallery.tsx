"use client";

import { useState } from "react";
import Image from "next/image";
import type { Dictionary } from "@/i18n";

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
  const gallery = images.length > 0 ? images : [];

  if (gallery.length === 0) return null;

  const current = gallery[Math.min(active, gallery.length - 1)];

  return (
    <div className="space-y-4">
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
        <Image
          src={current}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>

      {gallery.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={dict.products.gallery}>
          {gallery.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`${dict.products.gallery} ${index + 1}`}
              className={`relative size-16 overflow-hidden rounded-xl border-2 transition ${
                index === active
                  ? "border-emerald-600"
                  : "border-slate-200 hover:border-emerald-300"
              }`}
            >
              <Image src={src} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}