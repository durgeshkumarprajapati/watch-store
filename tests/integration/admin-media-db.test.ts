import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
import { ADMIN_PERMISSIONS } from "@/modules/admin/rbac-catalogue";
import {
  createAdminBrand,
  deleteAdminBrand,
  updateAdminBrand,
} from "@/modules/admin/catalogue/admin-brand-service";
import {
  createAdminCategory,
  deleteAdminCategory,
} from "@/modules/admin/catalogue/admin-category-service";
import {
  createAdminProduct,
  deleteProductImageById,
  uploadAndReplaceProductImage,
} from "@/modules/admin/catalogue/admin-product-service";
import { processMediaCleanupJobs } from "@/modules/admin/catalogue/media-cleanup-service";
import {
  type MediaStorageProvider,
  type StoredMediaResult,
  validateImageBuffer,
} from "@/modules/admin/catalogue/media-storage";
import { runProductMediaMigration } from "@/modules/admin/catalogue/media-migration-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

const VALID_WEBP = Buffer.from("RIFF\x24\x00\x00\x00WEBP", "ascii");

class MockCloudinaryProvider implements MediaStorageProvider {
  public readonly providerName = "cloudinary" as const;
  public uploaded: StoredMediaResult[] = [];
  public deletedPublicIds: string[] = [];
  private counter = 0;

  async saveProductImage(params: {
    buffer: Buffer;
    originalFilename: string;
    folder?: string;
    publicId?: string;
  }): Promise<StoredMediaResult> {
    const { mimeType, sizeBytes } = validateImageBuffer(params.buffer);
    this.counter += 1;
    const pid = params.publicId
      ? `${params.folder ?? "watchstore/products"}/${params.publicId}`
      : `${params.folder ?? "watchstore/products"}/mock_${this.counter}`;
    const res: StoredMediaResult = {
      url: `https://res.cloudinary.com/watchstore-test/image/upload/v1/${pid}.webp`,
      mimeType,
      sizeBytes,
      provider: "cloudinary",
      publicId: pid,
    };
    this.uploaded.push(res);
    return res;
  }

  async deleteProductImage(params: { publicId?: string }): Promise<{ deleted: boolean }> {
    if (!params.publicId) return { deleted: false };
    this.deletedPublicIds.push(params.publicId);
    return { deleted: true };
  }
}

describeWithDb("Phase 15 Media Storage PostgreSQL integration against watchstore_db", () => {
  let prisma: PrismaClient;
  let actor: AuthenticatedAdmin;
  let readOnlyActor: AuthenticatedAdmin;
  let actorEmail: string;
  const createdProductIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdCleanupUrls: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
    await seedRbac(prisma);

    actorEmail = `phase15-media-admin-${Date.now()}@watchstore.test`;
    const user = await prisma.user.create({
      data: {
        name: "Phase15 Media Admin",
        email: actorEmail,
        passwordHash: await hashPassword("Phase15Admin!2026"),
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
      name: "Phase15 Media Admin",
      initials: "PM",
      roles: ["CATALOG_MANAGER"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };

    readOnlyActor = {
      ...actor,
      roles: ["CUSTOMER_SUPPORT"],
      permissions: new Set(["dashboard.read", "products.read"]),
      isSuperAdmin: false,
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
    if (createdCleanupUrls.length > 0) {
      await prisma.mediaCleanupJob.deleteMany({ where: { url: { in: createdCleanupUrls } } });
    }
    await prisma.adminAuditLog.deleteMany({ where: { actorAdminId: actor.adminId } });
    await prisma.adminUser.deleteMany({ where: { id: actor.adminId } });
    await prisma.user.deleteMany({ where: { email: actorEmail } });
    await prisma.$disconnect();
  });

  it("associates, replaces safely, checks references on delete, and enforces RBAC & ownership", async () => {
    const brand = await prisma.brand.findFirstOrThrow();
    const category = await prisma.category.findFirstOrThrow();
    const sku = `WS-P15-${Date.now()}`;

    const mockProvider = new MockCloudinaryProvider();
    const uploaded1 = await mockProvider.saveProductImage({
      buffer: VALID_WEBP,
      originalFilename: "one.webp",
      folder: `watchstore/products/${sku.toLowerCase()}`,
    });
    const uploaded2 = await mockProvider.saveProductImage({
      buffer: VALID_WEBP,
      originalFilename: "two.webp",
      folder: `watchstore/products/${sku.toLowerCase()}`,
    });

    const created = await createAdminProduct(
      actor,
      {
        name: "Phase 15 Media Watch",
        slug: sku.toLowerCase(),
        sku,
        brandId: brand.id,
        categoryIds: [category.id],
        gender: "men",
        watchType: "automatic",
        strapMaterial: "steel",
        dialAndStrap: "Black Dial / Steel",
        description: "Testing Cloudinary media storage integration.",
        specMovement: "Automatic",
        specCaseDimensions: "40mm",
        specCrystal: "Sapphire",
        specWaterResistance: "100m",
        specHsn: "91021100",
        mrpPaise: 5000000,
        pricePaise: 4500000,
        gstRateBps: 1800,
        badge: null,
        isBestSeller: false,
        warrantyYears: 2,
        status: "DRAFT",
        images: [
          {
            url: uploaded1.url,
            alt: "Primary view",
            provider: uploaded1.provider,
            publicId: uploaded1.publicId,
          },
          {
            url: uploaded2.url,
            alt: "Side view",
            provider: uploaded2.provider,
            publicId: uploaded2.publicId,
          },
        ],
      },
      prisma,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdProductIds.push(created.productId);

    const dbImages = await prisma.productImage.findMany({
      where: { productId: created.productId },
      orderBy: { sortOrder: "asc" },
    });
    expect(dbImages).toHaveLength(2);
    expect(dbImages[0]?.provider).toBe("cloudinary");

    // Unauthorized replace & delete must be rejected
    const unauthReplace = await uploadAndReplaceProductImage(
      readOnlyActor,
      {
        productId: created.productId,
        imageId: dbImages[0]!.id,
        buffer: VALID_WEBP,
        originalFilename: "hack.webp",
      },
      prisma,
      mockProvider,
    );
    expect(unauthReplace.ok).toBe(false);

    // Wrong product ownership must be rejected
    const wrongOwnerDelete = await deleteProductImageById(
      actor,
      { productId: "non-existent-product", imageId: dbImages[0]!.id },
      prisma,
      mockProvider,
    );
    expect(wrongOwnerDelete.ok).toBe(false);

    // Safe replace of primary image deletes old asset after DB commit
    const replaced = await uploadAndReplaceProductImage(
      actor,
      {
        productId: created.productId,
        imageId: dbImages[0]!.id,
        buffer: VALID_WEBP,
        originalFilename: "replaced.webp",
      },
      prisma,
      mockProvider,
    );
    expect(replaced.ok).toBe(true);
    expect(mockProvider.deletedPublicIds).toContain(uploaded1.publicId);

    // Safe delete removes DB row, reindexes sortOrder, and deletes unreferenced remote asset
    const deletedRes = await deleteProductImageById(
      actor,
      { productId: created.productId, imageId: dbImages[1]!.id },
      prisma,
      mockProvider,
    );
    expect(deletedRes).toEqual({ ok: true, remoteDeleted: true });
    expect(mockProvider.deletedPublicIds).toContain(uploaded2.publicId);

    const remaining = await prisma.productImage.findMany({
      where: { productId: created.productId },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.sortOrder).toBe(0);
  });

  it("runs dry-run migration without mutations and executes idempotent migration on test local image", async () => {
    const dryRunReport = await runProductMediaMigration(prisma, { mode: "dry-run" });
    expect(dryRunReport.totalDiscovered).toBeGreaterThanOrEqual(12);
    expect(dryRunReport.migratedCount).toBe(0);
    expect(dryRunReport.verificationStatus).toBe("DRY_RUN_READY");

    // Create a temporary local file + test product to test execute & retry idempotency
    const tmpPublic = await mkdtemp(path.join(os.tmpdir(), "ws-migrate-public-"));
    try {
      const localRelUrl = "/images/uploads/products/test-local-watch.webp";
      await mkdir(path.join(tmpPublic, "images", "uploads", "products"), { recursive: true });
      await writeFile(path.join(tmpPublic, localRelUrl), VALID_WEBP);

      const brand = await prisma.brand.findFirstOrThrow();
      const category = await prisma.category.findFirstOrThrow();
      const sku = `WS-P15-MIG-${Date.now()}`;

      const created = await createAdminProduct(
        actor,
        {
          name: "Phase 15 Migration Test Watch",
          slug: sku.toLowerCase(),
          sku,
          brandId: brand.id,
          categoryIds: [category.id],
          gender: "unisex",
          watchType: "dress",
          strapMaterial: "leather",
          dialAndStrap: "White Dial / Leather",
          description: "Testing local to Cloudinary migration.",
          specMovement: "Quartz",
          specCaseDimensions: "38mm",
          specCrystal: "Sapphire",
          specWaterResistance: "50m",
          specHsn: "91021100",
          mrpPaise: 2500000,
          pricePaise: 2200000,
          gstRateBps: 1800,
          badge: null,
          isBestSeller: false,
          warrantyYears: 2,
          status: "DRAFT",
          images: [{ url: localRelUrl, alt: "Local watch", provider: "local", publicId: null }],
        },
        prisma,
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      createdProductIds.push(created.productId);

      const mockProvider = new MockCloudinaryProvider();
      const execReport = await runProductMediaMigration(prisma, {
        mode: "execute",
        storageProvider: mockProvider,
        publicRootDir: tmpPublic,
      });

      const migratedItem = execReport.items.find((i) => i.productId === created.productId);
      expect(migratedItem?.status).toBe("MIGRATED");
      expect(migratedItem?.migratedUrl).toContain("https://res.cloudinary.com/");

      // Retry must skip the already-migrated product image without duplicate upload
      const uploadsBeforeRetry = mockProvider.uploaded.length;
      const retryReport = await runProductMediaMigration(prisma, {
        mode: "execute",
        storageProvider: mockProvider,
        publicRootDir: tmpPublic,
      });
      const retriedItem = retryReport.items.find((i) => i.productId === created.productId);
      expect(retriedItem?.status).toBe("SKIPPED_ALREADY_MIGRATED");
      expect(
        retryReport.items.filter((i) => i.productId === created.productId && i.status === "MIGRATED"),
      ).toHaveLength(0);
      expect(mockProvider.uploaded.length).toBeLessThanOrEqual(uploadsBeforeRetry);
    } finally {
      await rm(tmpPublic, { recursive: true, force: true });
    }
  });

  it("handles brand/category uploads, durable cleanup retries, compound uniqueness, and concurrent replacements", async () => {
    // 1. Brand & Category Cloudinary metadata + cleanup on replace/delete
    const mockProvider = new MockCloudinaryProvider();
    const brandLogo1 = await mockProvider.saveProductImage({
      buffer: VALID_WEBP,
      originalFilename: "logo1.webp",
      folder: "watchstore/brands",
    });
    const brandLogo2 = await mockProvider.saveProductImage({
      buffer: VALID_WEBP,
      originalFilename: "logo2.webp",
      folder: "watchstore/brands",
    });
    createdCleanupUrls.push(brandLogo1.url, brandLogo2.url);

    const bRes = await createAdminBrand(
      actor,
      {
        name: `P15 Brand ${Date.now()}`,
        slug: `p15-brand-${Date.now()}`,
        description: "Test brand",
        logoUrl: brandLogo1.url,
        logoProvider: "cloudinary",
        logoPublicId: brandLogo1.publicId,
        isActive: true,
      },
      prisma,
    );
    expect(bRes.ok).toBe(true);
    if (!bRes.ok) return;
    createdBrandIds.push(bRes.brandId);

    const bUpdate = await updateAdminBrand(
      actor,
      bRes.brandId,
      {
        name: `P15 Brand Updated ${Date.now()}`,
        slug: `p15-brand-${Date.now()}`,
        description: "Updated",
        logoUrl: brandLogo2.url,
        logoProvider: "cloudinary",
        logoPublicId: brandLogo2.publicId,
        isActive: true,
      },
      prisma,
      mockProvider,
    );
    expect(bUpdate.ok).toBe(true);
    expect(mockProvider.deletedPublicIds).toContain(brandLogo1.publicId);

    const catImg = await mockProvider.saveProductImage({
      buffer: VALID_WEBP,
      originalFilename: "cat.webp",
      folder: "watchstore/categories",
    });
    createdCleanupUrls.push(catImg.url);
    const cRes = await createAdminCategory(
      actor,
      {
        name: `P15 Category ${Date.now()}`,
        slug: `p15-cat-${Date.now()}`,
        image: catImg.url,
        imageProvider: "cloudinary",
        imagePublicId: catImg.publicId,
        parentId: null,
        isActive: true,
      },
      prisma,
    );
    expect(cRes.ok).toBe(true);
    if (!cRes.ok) return;
    createdCategoryIds.push(cRes.categoryId);

    // 2. Durable cleanup retry when remote delete fails initially
    const failingDeleteProvider: MediaStorageProvider = {
      providerName: "cloudinary",
      saveProductImage: (p) => mockProvider.saveProductImage(p),
      async deleteProductImage() {
        throw new Error("Simulated Cloudinary 503 outage");
      },
    };

    const sku = `WS-P15-CONC-${Date.now()}`;
    const imgA = await mockProvider.saveProductImage({
      buffer: VALID_WEBP,
      originalFilename: "a.webp",
      folder: `watchstore/products/${sku.toLowerCase()}`,
    });
    createdCleanupUrls.push(imgA.url);

    const pRes = await createAdminProduct(
      actor,
      {
        name: "Phase 15 Concurrency Watch",
        slug: sku.toLowerCase(),
        sku,
        brandId: bRes.brandId,
        categoryIds: [cRes.categoryId],
        gender: "men",
        watchType: "chronograph",
        strapMaterial: "steel",
        dialAndStrap: "Blue / Steel",
        description: "Testing durable cleanup and concurrent replacement locking.",
        specMovement: "Automatic",
        specCaseDimensions: "41mm",
        specCrystal: "Sapphire",
        specWaterResistance: "100m",
        specHsn: "91021100",
        mrpPaise: 5500000,
        pricePaise: 4900000,
        gstRateBps: 1800,
        badge: null,
        isBestSeller: false,
        warrantyYears: 2,
        status: "DRAFT",
        images: [
          {
            url: imgA.url,
            alt: "Primary",
            provider: "cloudinary",
            publicId: imgA.publicId,
          },
        ],
      },
      prisma,
    );
    expect(pRes.ok).toBe(true);
    if (!pRes.ok) return;
    createdProductIds.push(pRes.productId);

    const prodImg = await prisma.productImage.findFirstOrThrow({
      where: { productId: pRes.productId },
    });

    // Replace using failingDeleteProvider -> DB update succeeds AND MediaCleanupJob is FAILED for retry
    const replaceWithOutage = await uploadAndReplaceProductImage(
      actor,
      {
        productId: pRes.productId,
        imageId: prodImg.id,
        buffer: VALID_WEBP,
        originalFilename: "b.webp",
      },
      prisma,
      failingDeleteProvider,
    );
    expect(replaceWithOutage.ok).toBe(true);
    if (replaceWithOutage.ok) createdCleanupUrls.push(replaceWithOutage.url);

    const failedJob = await prisma.mediaCleanupJob.findFirstOrThrow({
      where: { url: imgA.url },
    });
    expect(failedJob.status).toBe("FAILED");
    expect(failedJob.attempts).toBe(1);

    // Retry cleanup with healthy provider in the future
    const retryRes = await processMediaCleanupJobs(prisma, mockProvider, {
      jobId: failedJob.id,
      now: new Date(Date.now() + 10 * 60_000),
    });
    expect(retryRes.completed).toBe(1);
    const completedJob = await prisma.mediaCleanupJob.findUniqueOrThrow({
      where: { id: failedJob.id },
    });
    expect(completedJob.status).toBe("COMPLETED");

    // 3. Concurrent replacement serialization (Promise.all)
    const [r1, r2] = await Promise.all([
      uploadAndReplaceProductImage(
        actor,
        {
          productId: pRes.productId,
          imageId: prodImg.id,
          buffer: VALID_WEBP,
          originalFilename: "c1.webp",
        },
        prisma,
        mockProvider,
      ),
      uploadAndReplaceProductImage(
        actor,
        {
          productId: pRes.productId,
          imageId: prodImg.id,
          buffer: VALID_WEBP,
          originalFilename: "c2.webp",
        },
        prisma,
        mockProvider,
      ),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok) createdCleanupUrls.push(r1.url);
    if (r2.ok) createdCleanupUrls.push(r2.url);

    const finalImgs = await prisma.productImage.findMany({
      where: { productId: pRes.productId },
    });
    expect(finalImgs).toHaveLength(1);
    expect(finalImgs[0]?.sortOrder).toBe(0);

    // 4. Compound unique [provider, publicId] rejects duplicate asset claim
    await expect(
      prisma.productImage.create({
        data: {
          productId: pRes.productId,
          url: "https://res.cloudinary.com/watchstore-test/image/upload/dup.webp",
          alt: "Duplicate claim",
          sortOrder: 1,
          provider: finalImgs[0]!.provider,
          publicId: finalImgs[0]!.publicId,
        },
      }),
    ).rejects.toThrow();

    // Clean up product before deleting brand/category due to Restrict FK
    await prisma.product.delete({ where: { id: pRes.productId } });
    createdProductIds.pop();

    expect((await deleteAdminCategory(actor, cRes.categoryId, prisma, mockProvider)).ok).toBe(true);
    createdCategoryIds.pop();
    expect((await deleteAdminBrand(actor, bRes.brandId, prisma, mockProvider)).ok).toBe(true);
    createdBrandIds.pop();
  });
});
