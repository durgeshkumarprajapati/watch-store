"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { MediaImage } from "@/components/ui/media-image";
import { cn } from "@/lib/cn";

const ANGLE_LABELS = ["Front dial", "Movement & caseback", "On wrist", "Studio macro"];

export function ProductGallery({ images, productName }: { images: string[]; productName: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const currentSrc = images[activeIndex] ?? null;
  const currentAlt =
    activeIndex === 0 ? `${productName} — Front View` : `${productName} — ${ANGLE_LABELS[activeIndex] ?? `View ${activeIndex + 1}`}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[4/3] bg-surface border border-outline rounded overflow-hidden group">
        <MediaImage
          key={currentSrc ?? "placeholder"}
          src={currentSrc}
          alt={currentAlt}
          sizes="(min-width:1024px) 58vw, 100vw"
          priority
          className="w-full h-full"
          imageClassName="transition-transform duration-surface-enter group-hover:scale-105"
        />
        <span className="pointer-events-none absolute bottom-4 right-4 px-3 py-1.5 rounded-sm bg-surface/90 border border-outline font-label text-label-sm uppercase tracking-wider text-on-surface inline-flex items-center gap-1.5">
          <Icon name="zoom_in" size={16} />
          <span>Hover to Inspect</span>
        </span>
      </div>

      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-3 sm:gap-4" role="group" aria-label="Product gallery thumbnails">
          {images.map((src, i) => {
            const active = i === activeIndex;
            const label = ANGLE_LABELS[i] ?? `Angle ${i + 1}`;
            return (
              <button
                key={src}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`View ${label}`}
                aria-pressed={active}
                className={cn(
                  "aspect-square rounded overflow-hidden bg-surface transition-colors duration-state-change",
                  active ? "border-2 border-primary" : "border border-outline hover:border-primary",
                )}
              >
                <MediaImage
                  src={src}
                  alt={`${productName} — ${label}`}
                  sizes="(min-width:1024px) 12vw, 22vw"
                  className="w-full h-full"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
