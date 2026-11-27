import { revalidateTag, unstable_cache } from "next/cache";

export const CATALOGUE_CACHE_TAG = "catalogue";

export function withCatalogueCache<T>(
  keyParts: string[],
  fn: () => Promise<T>,
  revalidateSeconds = 60,
): Promise<T> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return fn();
  }
  const cachedFn = unstable_cache(fn, keyParts, {
    revalidate: revalidateSeconds,
    tags: [CATALOGUE_CACHE_TAG],
  });
  return cachedFn();
}

export function revalidatePublicCatalogueCache(): void {
  try {
    revalidateTag(CATALOGUE_CACHE_TAG, { expire: 0 });
  } catch {
    // Outside Next.js request/action context.
  }
}
