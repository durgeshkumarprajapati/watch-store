import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/modules/auth/auth", () => ({
  auth: vi.fn(async () => null),
}));

import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_DEFINITIONS,
  hasAdminPermission,
} from "@/modules/admin/rbac-catalogue";
import {
  AdminForbiddenError,
  AdminUnauthorizedError,
} from "@/modules/admin/admin-auth-service";

describe("Phase 8 — Admin RBAC Catalogue & Permission Boundaries", () => {
  it("defines all 37 expected permissions and grants all of them to SUPER_ADMIN", () => {
    expect(ADMIN_PERMISSIONS).toHaveLength(37);
    const superAdminPerms = new Set(ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.permissions);
    for (const perm of ADMIN_PERMISSIONS) {
      expect(superAdminPerms.has(perm)).toBe(true);
    }
  });

  it("enforces least-privilege permissions for non-SUPER_ADMIN roles", () => {
    const adminPerms = new Set(ADMIN_ROLE_DEFINITIONS.ADMIN.permissions);
    expect(adminPerms.has("dashboard.read")).toBe(true);
    expect(adminPerms.has("products.create")).toBe(true);
    expect(adminPerms.has("orders.update")).toBe(true);
    expect(adminPerms.has("admins.create")).toBe(false);
    expect(adminPerms.has("admins.deactivate")).toBe(false);
    expect(adminPerms.has("roles.manage")).toBe(false);

    const catalogPerms = new Set(ADMIN_ROLE_DEFINITIONS.CATALOG_MANAGER.permissions);
    expect(catalogPerms.has("products.read")).toBe(true);
    expect(catalogPerms.has("products.create")).toBe(true);
    expect(catalogPerms.has("categories.manage")).toBe(true);
    expect(catalogPerms.has("orders.read")).toBe(false);
    expect(catalogPerms.has("admins.read")).toBe(false);

    const orderPerms = new Set(ADMIN_ROLE_DEFINITIONS.ORDER_MANAGER.permissions);
    expect(orderPerms.has("orders.read")).toBe(true);
    expect(orderPerms.has("orders.update")).toBe(true);
    expect(orderPerms.has("products.create")).toBe(false);
    expect(orderPerms.has("admins.read")).toBe(false);

    const inventoryPerms = new Set(ADMIN_ROLE_DEFINITIONS.INVENTORY_MANAGER.permissions);
    expect(inventoryPerms.has("inventory.read")).toBe(true);
    expect(inventoryPerms.has("inventory.update")).toBe(true);
    expect(inventoryPerms.has("orders.update")).toBe(false);

    const supportPerms = new Set(ADMIN_ROLE_DEFINITIONS.CUSTOMER_SUPPORT.permissions);
    expect(supportPerms.has("customers.read")).toBe(true);
    expect(supportPerms.has("customers.manage")).toBe(false);
    expect(supportPerms.has("orders.read")).toBe(true);
    expect(supportPerms.has("orders.update")).toBe(false);
    expect(supportPerms.has("products.delete")).toBe(false);
  });

  it("evaluates hasAdminPermission accurately", () => {
    const perms = ["dashboard.read", "orders.read"];
    expect(hasAdminPermission(perms, "dashboard.read")).toBe(true);
    expect(hasAdminPermission(perms, "orders.read")).toBe(true);
    expect(hasAdminPermission(perms, "admins.create")).toBe(false);
  });

  it("constructs distinct AdminUnauthorizedError and AdminForbiddenError types", () => {
    const unauth = new AdminUnauthorizedError();
    const forbidden = new AdminForbiddenError();
    expect(unauth).toBeInstanceOf(Error);
    expect(unauth.name).toBe("AdminUnauthorizedError");
    expect(forbidden).toBeInstanceOf(Error);
    expect(forbidden.name).toBe("AdminForbiddenError");
  });
});
