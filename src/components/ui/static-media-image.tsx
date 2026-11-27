import Image from "next/image";
import { cn } from "@/lib/cn";
import { MediaImage } from "./media-image";

/**
 * Server-rendered image wrapper for verified local `/images/...` assets.
 * Avoids client hydration on every catalogue card while delegating external or
 * missing URLs to `MediaImage` so error-fallback behavior is preserved.
 */
export function StaticMediaImage({
  src,
  alt,
  sizes,
  className,
  imageClassName,
  priority = false,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}) {
  if (!src || !src.startsWith("/images/")) {
    return (
      <MediaImage
        src={src}
        alt={alt}
        sizes={sizes}
        className={className}
        imageClassName={imageClassName}
        priority={priority}
      />
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-surface-container", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn("object-cover", imageClassName)}
      />
    </div>
  );
}
