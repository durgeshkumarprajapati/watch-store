/* WatchStore Unified Service Worker: Phase 19B VAPID Push + Phase 19C Customer-Only PWA */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `watchstore-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `watchstore-images-${CACHE_VERSION}`;
const OFFLINE_CACHE = `watchstore-offline-${CACHE_VERSION}`;
const ACTIVE_CACHES = new Set([STATIC_CACHE, IMAGE_CACHE, OFFLINE_CACHE]);
const MAX_IMAGE_ENTRIES = 60;
const OFFLINE_URL = "/offline";

const SENSITIVE_CUSTOMER_EXACT = new Set([
  "/cart",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

const SENSITIVE_CUSTOMER_PREFIXES = ["/checkout", "/account", "/auth"];

function toSafeRelativeUrl(raw) {
  if (typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  return trimmed;
}

function isSensitiveCustomerPath(pathname) {
  if (SENSITIVE_CUSTOMER_EXACT.has(pathname)) return true;
  return SENSITIVE_CUSTOMER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isStaticAssetPath(pathname) {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/icons/")
  );
}

function isPublicImagePath(pathname) {
  return pathname.startsWith("/images/") || pathname === "/_next/image";
}

function isSafeToCacheResponse(response) {
  if (!response || !response.ok || response.status !== 200) return false;
  if (response.redirected) return false;
  if (response.headers.has("set-cookie")) return false;
  const cc = (response.headers.get("cache-control") || "").toLowerCase();
  if (cc.includes("no-store") || cc.includes("private")) return false;
  return true;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("watchstore-") && !ACTIVE_CACHES.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept Admin, API, HMR, or RSC payload requests
  if (
    url.pathname === "/admin" ||
    url.pathname.startsWith("/admin/") ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.searchParams.has("_rsc") ||
    request.headers.has("RSC")
  ) {
    return;
  }

  // Static assets: Cache-First (versioned)
  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (isSafeToCacheResponse(response)) {
              const copy = response.clone();
              void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Public images: Stale-While-Revalidate with bounded cache size
  if (isPublicImagePath(url.pathname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (isSafeToCacheResponse(response)) {
              const copy = response.clone();
              void cache
                .put(request, copy)
                .then(() => trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES));
            }
            return response;
          })
          .catch(() => cached || Response.error());

        return cached || networkPromise;
      }),
    );
    return;
  }

  // Customer navigation requests: Network-Only (never cache dynamic/personalized HTML) with /offline fallback
  if (request.mode === "navigate") {
    if (url.pathname === OFFLINE_URL) {
      event.respondWith(
        fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
      );
      return;
    }

    if (isSensitiveCustomerPath(url.pathname) || true) {
      event.respondWith(
        fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
      );
    }
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      try {
        payload = { body: event.data.text() };
      } catch {
        payload = {};
      }
    }
  }

  const title =
    typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim()
      : "WatchStore";
  const body =
    typeof payload.body === "string" && payload.body.trim().length > 0
      ? payload.body.trim()
      : "You have a new update.";
  const url = toSafeRelativeUrl(payload.url);
  const tag =
    typeof payload.tag === "string" && payload.tag.trim().length > 0
      ? payload.tag.trim()
      : "watchstore-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const relativeUrl = toSafeRelativeUrl(event.notification?.data?.url);
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            if ("navigate" in client && typeof client.navigate === "function") {
              return client.navigate(targetUrl).then(() => client.focus());
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
