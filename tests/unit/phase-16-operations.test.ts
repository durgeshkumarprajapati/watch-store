import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";
import { isAuthorizedCronRequest } from "@/modules/operations/scheduler-auth";

describe("Phase 16 Operations, Scheduler Auth & RBAC Unit Tests", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("enforces CRON_SECRET timing-safe auth and rejects SHIPROCKET_CRON_SECRET fallback", () => {
    process.env.CRON_SECRET = "super-secure-cron-secret-1234";
    process.env.SHIPROCKET_CRON_SECRET = "legacy-shiprocket-secret-1234";

    expect(isAuthorizedCronRequest("Bearer super-secure-cron-secret-1234")).toBe(true);
    expect(isAuthorizedCronRequest("Bearer legacy-shiprocket-secret-1234")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer wrong-secret")).toBe(false);
    expect(isAuthorizedCronRequest("Basic super-secure-cron-secret-1234")).toBe(false);
    expect(isAuthorizedCronRequest(null)).toBe(false);

    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest("Bearer legacy-shiprocket-secret-1234")).toBe(false);
  });

  it("defines valid Vercel Cron schedules for all 5 operational routes", () => {
    const raw = readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");
    const parsed = JSON.parse(raw) as { crons: { path: string; schedule: string }[] };
    const paths = parsed.crons.map((c) => c.path);

    expect(paths).toContain("/api/internal/reservations/cleanup");
    expect(paths).toContain("/api/internal/shipping/sync");
    expect(paths).toContain("/api/internal/notifications/process");
    expect(paths).toContain("/api/internal/media/cleanup");
    expect(paths).toContain("/api/internal/payments/reconcile");
    for (const cron of parsed.crons) {
      expect(cron.schedule.split(" ")).toHaveLength(5);
    }
  });

  it("restricts operations.read and operations.manage to SUPER_ADMIN and ADMIN", () => {
    expect(ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.permissions).toContain("operations.read");
    expect(ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.permissions).toContain("operations.manage");
    expect(ADMIN_ROLE_DEFINITIONS.ADMIN.permissions).toContain("operations.read");
    expect(ADMIN_ROLE_DEFINITIONS.ADMIN.permissions).toContain("operations.manage");

    expect(ADMIN_ROLE_DEFINITIONS.ORDER_MANAGER.permissions).not.toContain("operations.manage");
    expect(ADMIN_ROLE_DEFINITIONS.CATALOG_MANAGER.permissions).not.toContain("operations.read");
    expect(ADMIN_ROLE_DEFINITIONS.INVENTORY_MANAGER.permissions).not.toContain("operations.read");
    expect(ADMIN_ROLE_DEFINITIONS.CUSTOMER_SUPPORT.permissions).not.toContain("operations.read");
  });
});
