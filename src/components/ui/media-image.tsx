"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";

/**
 * Local image with a proper placeholder. Images live under /public/images/** and are
 * never loaded from external URLs. If the file is missing or fails to load, a neutral
 * placeholder is shown so real client photography can replace development images
 * without code changes.
 */
export function MediaImage({
  src, alt, sizes, className, imageClassName, priority = false,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;
  return (
    <div className={cn("relative overflow-hidden bg-surface-container", className)}>
      {showPlaceholder ? (
        <div role="img" aria-label={alt} className="absolute inset-0 flex items-center justify-center text-on-surface-variant/40">
          <Icon name="watch" size={48} />
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setFailed(true)}
          className={cn("object-cover", imageClassName)}
        />
      )}
    </div>
  );
}
