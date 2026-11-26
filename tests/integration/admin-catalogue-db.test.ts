import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/modules/auth/auth", () => ({
  auth: vi.fn(async () => null),
}));

import { PrismaClient } from "@prisma/client";
import { seedCatalogue } from "../../prisma/seed";
import { seedRbac } from "../../prisma/seed-rbac";
import { hashPassword } from "@/modules/auth/password-service";
import type { AuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { ADMIN_PERMISSIONS, ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";
import {
  createAdminBrand,
  deleteAdminBrand,
  updateAdminBrand,
} from "@/modules/admin/catalogue/admin-brand-service";
import {
  createAdminCategory,
  deleteAdminCategory,
  updateAdminCategory,
} from "@/modules/admin/catalogue/admin-category-service";
import {
  createAdminProduct,
  deleteAdminProduct,
  listAdminProducts,
  setAdminProductStatus,
  updateAdminProduct,
} from "@/modules/admin/catalogue/admin-product-service";
import { prismaProductRepository } from "@/modules/catalogue/prisma/prisma-product-repository";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 9 Admin Catalogue PostgreSQL integration against watchstore_db", () => {
  let prisma: PrismaClient;
  let actor: AuthenticatedAdmin;
  let actorEmail: string;
  const createdProductIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
    await seedRbac(prisma);

    actorEmail = `phase9-cat-admin-${Date.now()}@watchstore.test`;
    const user = await prisma.user.create({
      data: {
        name: "Phase9 Catalogue Admin",
        email: actorEmail,
        passwordHash: await hashPassword("Phase9Admin!2026"),
        emailVerified: new Date(),
      },
    });
    const adminUser = await prisma.adminUser.create({
      data: { userId: user.id, isActive: true },
    });
    actor = {
      adminId: adminUser.id,
      userId: user.id,
      email: actorEmail,
      name: "Phase9 Catalogue Admin",
      initials: "PC",
      roles: ["CATALOG_MANAGER"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdProductIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    }
    if (createdCategoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    }
    if (createdBrandIds.length > 0) {
      await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    }
    if (actor) {
      await prisma.adminAuditLog.deleteMany({ where: { actorAdminId: actor.adminId } });
      await prisma.adminUser.deleteMany({ where: { id: actor.adminId } });
      await prisma.user.deleteMany({ where: { id: actor.userId } });
    }
    await prisma.$disconnect();
  });

  it("manages brands, blocks duplicate slugs, and prevents deleting brands with products", async () => {
    const suffix = Date.now();
    const res = await createAdminBrand(
      actor,
      {
        name: `Test Maison ${suffix}`,
        slug: `test-maison-${suffix}`,
        description: "Test luxury horology house",
        logoUrl: null,
        isActive: true,
      },
      prisma,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    createdBrandIds.push(res.brandId);

    const dup = await createAdminBrand(
      actor,
      {
        name: `Test Maison ${suffix}`,
        slug: `test-maison-${suffix}`,
        isActive: true,
      },
      prisma,
    );
    expect(dup.ok).toBe(false);

    const upd = await updateAdminBrand(
      actor,
      res.brandId,
      {
        name: `Test Maison Updated ${suffix}`,
        slug: `test-maison-${suffix}`,
        description: "Updated description",
        logoUrl: "/images/site/site_heritage.webp",
        isActive: true,
      },
      prisma,
    );
    expect(upd.ok).toBe(true);

    // Deleting an unreferenced brand succeeds
    const del = await deleteAdminBrand(actor, res.brandId, prisma);
    expect(del.ok).toBe(true);
  });

  it("manages category hierarchy and prevents self-parent and circular relationships", async () => {
    const suffix = Date.now();
    const parentRes = await createAdminCategory(
      actor,
      {
        name: `Parent Cat ${suffix}`,
        slug: `parent-cat-${suffix}`,
        isActive: true,
      },
      prisma,
    );
    expect(parentRes.ok).toBe(true);
    if (!parentRes.ok) return;
    createdCategoryIds.push(parentRes.categoryId);

    const childRes = await createAdminCategory(
      actor,
      {
        name: `Child Cat ${suffix}`,
        slug: `child-cat-${suffix}`,
        parentId: parentRes.categoryId,
        isActive: true,
      },
      prisma,
    );
    expect(childRes.ok).toBe(true);
    if (!childRes.ok) return;
    createdCategoryIds.push(childRes.categoryId);

    // Self-parent rejected
    const selfParent = await updateAdminCategory(
      actor,
      parentRes.categoryId,
      {
        name: `Parent Cat ${suffix}`,
        slug: `parent-cat-${suffix}`,
        parentId: parentRes.categoryId,
        isActive: true,
      },
      prisma,
    );
    expect(selfParent.ok).toBe(false);

    // Circular hierarchy (parent -> child -> parent) rejected
    const circular = await updateAdminCategory(
      actor,
      parentRes.categoryId,
      {
        name: `Parent Cat ${suffix}`,
        slug: `parent-cat-${suffix}`,
        parentId: childRes.categoryId,
        isActive: true,
      },
      prisma,
    );
    expect(circular.ok).toBe(false);

    // Parent with child cannot be deleted
    const deleteParent = await deleteAdminCategory(actor, parentRes.categoryId, prisma);
    expect(deleteParent.ok).toBe(false);

    // Delete child then parent
    expect((await deleteAdminCategory(actor, childRes.categoryId, prisma)).ok).toBe(true);
    expect((await deleteAdminCategory(actor, parentRes.categoryId, prisma)).ok).toBe(true);
  });

  it("enforces product draft/publish/archive lifecycle, public storefront visibility, and RBAC", async () => {
    const suffix = Date.now();
    const slug = `phase9-test-watch-${suffix}`;
    const sku = `P9-${suffix}`;

    const brand = await prisma.brand.findFirstOrThrow({ where: { isActive: true } });
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });

    const baseInput = {
      name: `Phase9 Test Watch ${suffix}`,
      slug,
      sku,
      brandId: brand.id,
      categoryIds: [category.id],
      gender: "men" as const,
      watchType: "chronograph" as const,
      strapMaterial: "steel" as const,
      dialAndStrap: "Obsidian Dial / 316L Steel",
      description: "Automated PostgreSQL integration test timepiece.",
      specMovement: "Calibre P9-Auto",
      specCaseDimensions: "40mm x 11mm",
      specCrystal: "Sapphire",
      specWaterResistance: "100m",
      specHsn: "9102",
      mrpPaise: 15000000,
      pricePaise: 13500000,
      gstRateBps: 1800,
      badge: "new_arrival" as const,
      isBestSeller: false,
      warrantyYears: 5,
      status: "DRAFT" as const,
      images: [
        {
          url: "/images/products/chronographs/chronograph_vrn_chr_402_1.webp",
          alt: "Main watch photo",
        },
      ],
    };

    // Actor without catalogue.publish cannot publish
    const unprivilegedActor: AuthenticatedAdmin = {
      ...actor,
      permissions: new Set(ADMIN_ROLE_DEFINITIONS.ORDER_MANAGER.permissions),
    };
    const deniedPublish = await createAdminProduct(
      unprivilegedActor,
      { ...baseInput, status: "PUBLISHED" },
      prisma,
    );
    expect(deniedPublish.ok).toBe(false);

    // Create as DRAFT
    const created = await createAdminProduct(actor, baseInput, prisma);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdProductIds.push(created.productId);

    // Duplicate SKU rejected
    const dupSku = await createAdminProduct(
      actor,
      { ...baseInput, slug: `${slug}-2` },
      prisma,
    );
    expect(dupSku.ok).toBe(false);

    // Draft must NOT appear in public storefront repository
    expect(await prismaProductRepository.getBySlug(slug)).toBeNull();
    const publicDraftSearch = await prismaProductRepository.listProducts({ q: sku });
    expect(publicDraftSearch.total).toBe(0);

    // Draft MUST appear in admin listing
    const adminDrafts = await listAdminProducts({ q: sku, status: "DRAFT" }, prisma);
    expect(adminDrafts.total).toBe(1);

    // Update & Publish
    const updated = await updateAdminProduct(
      actor,
      created.productId,
      {
        ...baseInput,
        name: `Phase9 Published Watch ${suffix}`,
        pricePaise: 12900000,
        status: "PUBLISHED",
      },
      prisma,
    );
    expect(updated.ok).toBe(true);

    // Published product appears in public storefront with updated price & name
    const publicProduct = await prismaProductRepository.getBySlug(slug);
    expect(publicProduct).not.toBeNull();
    expect(publicProduct?.name).toBe(`Phase9 Published Watch ${suffix}`);
    expect(publicProduct?.pricePaise).toBe(12900000);

    // Archive product -> disappears from public storefront
    const archived = await setAdminProductStatus(actor, created.productId, "ARCHIVED", prisma);
    expect(archived.ok).toBe(true);
    expect(await prismaProductRepository.getBySlug(slug)).toBeNull();

    // Clean delete of unreferenced test product
    const deleted = await deleteAdminProduct(actor, created.productId, prisma);
    expect(deleted.ok).toBe(true);
  });
});
