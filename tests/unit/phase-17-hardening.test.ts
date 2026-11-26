import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ProductionEnvError, validateProductionEnv } from "@/config/env";
import { checkHealthResponse } from "@/app/api/health/route";
import nextConfig, { buildSecurityHeaders } from "../../next.config";
import { assertSeedAllowed } from "../../prisma/seed";

describe("Phase 17 Production Hardening Unit Tests", () => {
  it("validates mandatory production env vars, skips during next build, and catches partial provider configs", () => {
    expect(
      validateProductionEnv({
        envSource: { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      }),
    ).toEqual({ ok: true });

    expect(
      validateProductionEnv({
        envSource: {
          NODE_ENV: "production",
          NEXT_PHASE: "phase-production-build",
        } as NodeJS.ProcessEnv,
      }),
    ).toEqual({ ok: true, skippedBuildTime: true });

    expect(() =>
      validateProductionEnv({
        force: true,
        envSource: {
          NODE_ENV: "production",
          AUTH_URL: "http://localhost:3000",
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow(ProductionEnvError);

    expect(() =>
      validateProductionEnv({
        force: true,
        envSource: {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://user:pass@host:5432/db",
          AUTH_SECRET: "prod-auth-secret-at-least-16-chars",
          CRON_SECRET: "prod-cron-secret-at-least-16-chars",
          AUTH_URL: "https://watchstore.example.com",
          RAZORPAY_KEY_ID: "rzp_live_123",
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow(/RAZORPAY_KEY_ID\/RAZORPAY_KEY_SECRET/);

    expect(
      validateProductionEnv({
        force: true,
        envSource: {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://user:pass@host:5432/db",
          AUTH_SECRET: "prod-auth-secret-at-least-16-chars",
          CRON_SECRET: "prod-cron-secret-at-least-16-chars",
          AUTH_URL: "https://watchstore.example.com",
        } as NodeJS.ProcessEnv,
      }),
    ).toEqual({ ok: true });
  });

  it("returns 200 on healthy DB and sanitized 503 with no-store on DB failure", async () => {
    const okRes = await checkHealthResponse(async () => [{ "?column?": 1 }]);
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("Cache-Control")).toContain("no-store");
    const okJson = (await okRes.json()) as { status: string };
    expect(okJson.status).toBe("ok");

    const failRes = await checkHealthResponse(async () => {
      throw new Error("ECONNREFUSED postgresql://secret_user:secret_pass@db:5432");
    });
    expect(failRes.status).toBe(503);
    expect(failRes.headers.get("Cache-Control")).toContain("no-store");
    const failText = await failRes.text();
    expect(failText).not.toContain("secret_pass");
    expect(failText).not.toContain("ECONNREFUSED");
    expect(JSON.parse(failText).status).toBe("unavailable");
  });

  it("configures security headers and enables HSTS only in production", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);

    const devHeaders = buildSecurityHeaders(false);
    expect(devHeaders.some((h) => h.key === "X-Content-Type-Options" && h.value === "nosniff")).toBe(
      true,
    );
    expect(devHeaders.some((h) => h.key === "X-Frame-Options" && h.value === "DENY")).toBe(true);
    expect(devHeaders.some((h) => h.key === "Strict-Transport-Security")).toBe(false);

    const prodHeaders = buildSecurityHeaders(true);
    expect(prodHeaders.some((h) => h.key === "Strict-Transport-Security")).toBe(true);
  });

  it("protects prisma/seed.ts from accidental production execution", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow(/ALLOW_PRODUCTION_SEED=true/);

    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "production",
        ALLOW_PRODUCTION_SEED: "true",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();

    expect(() =>
      assertSeedAllowed({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
