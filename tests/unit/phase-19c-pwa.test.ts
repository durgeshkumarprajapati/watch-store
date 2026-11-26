import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PWA_ACTIVE_CACHES,
  classifyPwaAsset,
  isCacheableSafeAssetResponse,
  isIosSafariUserAgent,
  shouldBypassServiceWorker,
} from "@/lib/pwa-config";

const rootDir = process.cwd();

describe("Phase 19C — Customer-Only PWA Manifest, Icons & Service Worker Safety", () => {
  it("provides a valid customer-facing manifest.webmanifest with all referenced WatchStore icons", () => {
    const manifestPath = path.join(rootDir, "public", "manifest.webmanifest");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      name: string;
      short_name: string;
      description: string;
      start_url: string;
      scope: string;
      display: string;
      background_color: string;
      theme_color: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };

    expect(manifest.name).toBe("WatchStore");
    expect(manifest.short_name).toBe("WatchStore");
    expect(manifest.description).toBe("Luxury Watches and Premium Timepieces");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toBe("#f5f2ec");
    expect(manifest.theme_color).toBe("#172a3a");

    const requiredSizes = ["192x192", "512x512"];
    for (const size of requiredSizes) {
      expect(manifest.icons.some((i) => i.sizes === size && i.purpose === "any")).toBe(true);
      expect(manifest.icons.some((i) => i.sizes === size && i.purpose === "maskable")).toBe(true);
    }

    for (const icon of manifest.icons) {
      const iconFile = path.join(rootDir, "public", icon.src.replace(/^\//, ""));
      expect(fs.existsSync(iconFile)).toBe(true);
    }

    const appleIcon = path.join(rootDir, "public", "icons", "apple-touch-icon.png");
    expect(fs.existsSync(appleIcon)).toBe(true);
  });

  it("bypasses admin, API, RSC, non-GET, cross-origin, and sensitive customer routes", () => {
    const origin = "https://watchstore.example";

    expect(
      shouldBypassServiceWorker({
        method: "POST",
        origin,
        requestOrigin: origin,
        pathname: "/api/checkout",
      }),
    ).toBe(true);

    expect(
      shouldBypassServiceWorker({
        method: "GET",
        origin,
        requestOrigin: origin,
        pathname: "/admin/dashboard",
      }),
    ).toBe(true);

    expect(
      shouldBypassServiceWorker({
        method: "GET",
        origin,
        requestOrigin: origin,
        pathname: "/api/notifications/inbox",
      }),
    ).toBe(true);

    expect(
      shouldBypassServiceWorker({
        method: "GET",
        origin,
        requestOrigin: origin,
        pathname: "/cart",
      }),
    ).toBe(true);

    expect(
      shouldBypassServiceWorker({
        method: "GET",
        origin,
        requestOrigin: origin,
        pathname: "/checkout",
      }),
    ).toBe(true);

    expect(
      shouldBypassServiceWorker({
        method: "GET",
        origin,
        requestOrigin: origin,
        pathname: "/account/orders",
      }),
    ).toBe(true);

    expect(
      shouldBypassServiceWorker({
        method: "GET",
        origin,
        requestOrigin: origin,
        pathname: "/products",
        search: "?_rsc=1abc",
      }),
    ).toBe(true);

    expect(
      shouldBypassServiceWorker({
        method: "GET",
        origin,
        requestOrigin: origin,
        pathname: "/products",
        hasRscHeader: true,
      }),
    ).toBe(true);

    expect(
      shouldBypassServiceWorker({
        method: "GET",
        origin,
        requestOrigin: "https://evil.example",
        pathname: "/images/watch.png",
      }),
    ).toBe(true);

    expect(
      shouldBypassServiceWorker({
        method: "GET",
        origin,
        requestOrigin: origin,
        pathname: "/_next/static/chunks/app.js",
      }),
    ).toBe(false);
  });

  it("classifies static/image assets and checks response cacheability headers", () => {
    expect(classifyPwaAsset("/_next/static/chunks/main.js")).toBe("static");
    expect(classifyPwaAsset("/fonts/bodoni.woff2")).toBe("static");
    expect(classifyPwaAsset("/icons/icon-192x192.png")).toBe("static");
    expect(classifyPwaAsset("/images/watch.png")).toBe("image");
    expect(classifyPwaAsset("/_next/image")).toBe("image");

    expect(
      isCacheableSafeAssetResponse({ status: 200, hasSetCookie: false, cacheControl: "public, max-age=3600" }),
    ).toBe(true);
    expect(
      isCacheableSafeAssetResponse({ status: 200, hasSetCookie: true, cacheControl: "public" }),
    ).toBe(false);
    expect(
      isCacheableSafeAssetResponse({ status: 200, hasSetCookie: false, cacheControl: "no-store" }),
    ).toBe(false);
    expect(
      isCacheableSafeAssetResponse({ status: 200, hasSetCookie: false, cacheControl: "private, max-age=60" }),
    ).toBe(false);
    expect(
      isCacheableSafeAssetResponse({ status: 500, hasSetCookie: false }),
    ).toBe(false);
  });

  it("detects iOS Safari user agents accurately", () => {
    expect(
      isIosSafariUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(true);
    expect(
      isIosSafariUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(
      isIosSafariUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });

  it("preserves VAPID push handlers, cache versioning, and admin isolation in public/sw.js", () => {
    const swPath = path.join(rootDir, "public", "sw.js");
    const sw = fs.readFileSync(swPath, "utf8");

    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).toContain("toSafeRelativeUrl");
    expect(sw).toContain('url.pathname.startsWith("/admin/")');
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('url.searchParams.has("_rsc")');
    expect(sw).toContain('const OFFLINE_URL = "/offline"');
    for (const cacheName of PWA_ACTIVE_CACHES) {
      expect(sw).toContain(cacheName.replace("-v1", "-${CACHE_VERSION}"));
    }

    const adminLayoutPath = path.join(rootDir, "src", "app", "admin", "layout.tsx");
    const adminLayout = fs.readFileSync(adminLayoutPath, "utf8");
    expect(adminLayout).not.toContain("CustomerPwaManager");
    expect(adminLayout).not.toContain("manifest");
  });
});
