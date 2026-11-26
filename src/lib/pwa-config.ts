export const PWA_CACHE_VERSION = "v1";
export const PWA_STATIC_CACHE = `watchstore-static-${PWA_CACHE_VERSION}`;
export const PWA_IMAGE_CACHE = `watchstore-images-${PWA_CACHE_VERSION}`;
export const PWA_OFFLINE_CACHE = `watchstore-offline-${PWA_CACHE_VERSION}`;
export const PWA_ACTIVE_CACHES = [
  PWA_STATIC_CACHE,
  PWA_IMAGE_CACHE,
  PWA_OFFLINE_CACHE,
] as const;

export const PWA_IMAGE_CACHE_MAX_ENTRIES = 60;
export const PWA_INSTALL_DISMISS_STORAGE_KEY = "watchstore_pwa_install_dismissed_at";
export const PWA_INSTALL_DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

const BYPASS_EXACT_PATHS = new Set(["/cart", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email"]);

const BYPASS_PREFIXES = [
  "/admin",
  "/api",
  "/checkout",
  "/account",
  "/auth",
  "/_next/webpack-hmr",
];

const STATIC_ASSET_PREFIXES = ["/_next/static/", "/fonts/", "/icons/"];
const STATIC_EXACT_PATHS = new Set(["/favicon.ico", "/manifest.webmanifest"]);

export function shouldBypassServiceWorker(params: {
  method: string;
  origin: string;
  requestOrigin: string;
  pathname: string;
  search?: string;
  hasRscHeader?: boolean;
}): boolean {
  if (params.method.toUpperCase() !== "GET") return true;
  if (params.origin !== params.requestOrigin) return true;
  if (params.hasRscHeader) return true;
  if (params.search && params.search.includes("_rsc=")) return true;

  if (BYPASS_EXACT_PATHS.has(params.pathname)) return true;
  if (
    BYPASS_PREFIXES.some(
      (prefix) => params.pathname === prefix || params.pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  return false;
}

export function classifyPwaAsset(pathname: string): "static" | "image" | "navigation" | "other" {
  if (
    STATIC_EXACT_PATHS.has(pathname) ||
    STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return "static";
  }
  if (pathname.startsWith("/images/") || pathname === "/_next/image") {
    return "image";
  }
  return "other";
}

export function isCacheableSafeAssetResponse(params: {
  status: number;
  hasSetCookie: boolean;
  cacheControl?: string | null;
}): boolean {
  if (params.status !== 200) return false;
  if (params.hasSetCookie) return false;
  const cc = (params.cacheControl ?? "").toLowerCase();
  if (cc.includes("no-store") || cc.includes("private")) return false;
  return true;
}

export function isIosSafariUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|opios|chrome/.test(ua);
  return isIos && isSafari;
}
