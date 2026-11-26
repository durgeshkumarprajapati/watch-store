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
import type { GoogleSheetsClient } from "@/modules/admin/catalogue-sync/google-sheets-client";
import { CATALOGUE_SHEET_HEADERS } from "@/modules/admin/catalogue-sync/sheets-mapper";
import {
  disconnectSheetsConnection,
  exportCatalogueToSheets,
  getCatalogueSyncJobDetail,
  getSheetsSyncDashboardMetrics,
  runCatalogueImport,
  saveSheetsConnection,
} from "@/modules/admin/catalogue-sync/sheets-sync-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

class InMemorySheetsClient implements GoogleSheetsClient {
  public sheetTitle = "WatchStore Catalogue";
  public worksheets = ["Catalogue"];
  public rows: string[][] = [];

  async verifySpreadsheetAccess(_spreadsheetId: string, worksheetName: string) {
    return {
      title: this.sheetTitle,
      worksheets: this.worksheets.includes(worksheetName)
        ? this.worksheets
        : [...this.worksheets, worksheetName],
    };
  }

  async readRange() {
    return this.rows;
  }

  async clearRange() {
    this.rows = [];
  }

  async writeRange(_spreadsheetId: string, _range: string, values: (string | number | boolean)[][]) {
    this.rows = values.map((r) => r.map((cell) => String(cell ?? "")));
    return {
      updatedRows: values.length,
      updatedCells: values.reduce((sum, r) => sum + r.length, 0),
    };
  }
}

describeWithDb("Phase 14 Google Sheets Sync PostgreSQL integration against watchstore_db", () => {
  let prisma: PrismaClient;
  let actor: AuthenticatedAdmin;
  let actorEmail: string;
  let mockClient: InMemorySheetsClient;

  const createdJobIds: string[] = [];
  const createdSkus: string[] = [];
  const createdConnectionSpreadsheetIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
    await seedRbac(prisma);

    actorEmail = `phase14-sheets-admin-${Date.now()}@watchstore.test`;
    const user = await prisma.user.create({
      data: {
        name: "Phase14 Sheets Admin",
        email: actorEmail,
        passwordHash: await hashPassword("Phase14Admin!2026"),
        emailVerified: new Date(),
      },
    });
    const adminUser = await prisma.adminUser.create({
      data: {
        userId: user.id,
        isActive: true,
      },
    });

    actor = {
      adminId: adminUser.id,
      userId: user.id,
      email: actorEmail,
      name: "Phase14 Sheets Admin",
      initials: "PS",
      roles: ["SUPER_ADMIN"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };

    mockClient = new InMemorySheetsClient();
  });

  afterAll(async () => {
    if (!prisma) return;

    if (createdJobIds.length > 0) {
      await prisma.catalogueSyncRowResult.deleteMany({
        where: { syncJobId: { in: createdJobIds } },
      });
      await prisma.catalogueSyncJob.deleteMany({
        where: { id: { in: createdJobIds } },
      });
    }

    if (createdSkus.length > 0) {
      await prisma.product.deleteMany({
        where: { sku: { in: createdSkus } },
      });
    }

    if (createdConnectionSpreadsheetIds.length > 0) {
      await prisma.googleSheetsConnection.deleteMany({
        where: { spreadsheetId: { in: createdConnectionSpreadsheetIds } },
      });
    }

    await prisma.adminAuditLog.deleteMany({
      where: { actorAdminId: actor.adminId },
    });
    await prisma.adminUser.deleteMany({
      where: { id: actor.adminId },
    });
    await prisma.user.deleteMany({
      where: { email: actorEmail },
    });

    await prisma.$disconnect();
  });

  it("saves connection, exports catalogue, and preserves PostgreSQL as source of truth", async () => {
    const spreadsheetId = `1TestSheet_${Date.now()}`;
    createdConnectionSpreadsheetIds.push(spreadsheetId);

    const saved = await saveSheetsConnection(
      actor,
      { spreadsheetId, worksheetName: "Catalogue" },
      mockClient,
      prisma,
    );
    expect(saved).toEqual({ ok: true, title: "WatchStore Catalogue" });

    const exportRes = await exportCatalogueToSheets(
      actor,
      `export-test-${Date.now()}`,
      mockClient,
      prisma,
    );
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;
    createdJobIds.push(exportRes.syncJobId);

    expect(exportRes.totalRows).toBeGreaterThanOrEqual(12);
    expect(mockClient.rows[0]).toEqual([...CATALOGUE_SHEET_HEADERS]);
    expect(mockClient.rows.length).toBe(exportRes.totalRows + 1);

    const metrics = await getSheetsSyncDashboardMetrics(prisma);
    expect(metrics.connection?.spreadsheetId).toBe(spreadsheetId);
    expect(metrics.connection?.lastExportedAt).not.toBeNull();
  });

  it("runs dry-run and commit import with create, update, conflict detection, and non-destructive deletes", async () => {
    const brand = await prisma.brand.findFirstOrThrow({ orderBy: { name: "asc" } });
    const category = await prisma.category.findFirstOrThrow({ orderBy: { slug: "asc" } });

    const newSku = `WS-P14-${Date.now()}`;
    createdSkus.push(newSku);

    const existingProduct = await prisma.product.findFirstOrThrow({
      orderBy: { sku: "asc" },
      include: {
        brand: { select: { name: true } },
        categories: { include: { category: { select: { slug: true } } } },
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
      },
    });
    const originalProductCount = await prisma.product.count();

    // Prepare sheet with:
    // 1. Existing product row (updated name)
    // 2. New product row (should default to DRAFT)
    // 3. Invalid row (bad price)
    // 4. Duplicate SKU row
    // Notice all other existing products are omitted ("deleted from sheet") — must NOT be deleted in DB.
    const existingRow = [
      existingProduct.sku,
      `${existingProduct.name} Updated`,
      existingProduct.slug,
      existingProduct.brand.name,
      existingProduct.categories.map((c) => c.category.slug).join(", "),
      existingProduct.gender,
      existingProduct.watchType,
      existingProduct.strapMaterial,
      existingProduct.dialAndStrap,
      existingProduct.description,
      existingProduct.specMovement,
      existingProduct.specCaseDimensions,
      existingProduct.specCrystal,
      existingProduct.specWaterResistance,
      existingProduct.specHsn,
      String(existingProduct.mrpPaise / 100),
      String(existingProduct.pricePaise / 100),
      String(existingProduct.gstRateBps / 100),
      existingProduct.badge ?? "",
      existingProduct.isBestSeller ? "TRUE" : "FALSE",
      existingProduct.warrantyYears ? String(existingProduct.warrantyYears) : "2",
      existingProduct.status,
      existingProduct.images[0]?.url ?? "",
      existingProduct.updatedAt.toISOString(),
    ];

    const newRow = [
      newSku,
      "Phase 14 Test Chronometer",
      newSku.toLowerCase(),
      brand.name,
      category.slug,
      "men",
      "automatic",
      "leather",
      "Ivory Dial / Brown Leather",
      "Imported via Phase 14 integration test.",
      "Automatic Calibre",
      "40mm x 11mm",
      "Sapphire",
      "50m",
      "91021100",
      "65000",
      "58000",
      "18",
      "limited",
      "FALSE",
      "2",
      "DRAFT",
      "/images/watches/test.jpg",
      "",
    ];

    const invalidRow = [...newRow];
    invalidRow[0] = `WS-P14-ERR-${Date.now()}`;
    invalidRow[2] = invalidRow[0].toLowerCase();
    invalidRow[16] = "not-a-price";

    const dupRow1 = [...newRow];
    dupRow1[0] = `WS-P14-DUP-${Date.now()}`;
    dupRow1[2] = dupRow1[0].toLowerCase();
    const dupRow2 = [...dupRow1];

    mockClient.rows = [
      [...CATALOGUE_SHEET_HEADERS],
      existingRow,
      newRow,
      invalidRow,
      dupRow1,
      dupRow2,
    ];

    // 1. Dry Run must NOT mutate DB
    const dryRun = await runCatalogueImport(
      actor,
      { isDryRun: true, idempotencyKey: `dry-run-${Date.now()}` },
      mockClient,
      prisma,
    );
    expect(dryRun.ok).toBe(true);
    if (!dryRun.ok) return;
    createdJobIds.push(dryRun.syncJobId);
    expect(dryRun.isDryRun).toBe(true);
    expect(dryRun.createdRows).toBe(1);
    expect(dryRun.updatedRows).toBe(1);
    expect(dryRun.failedRows).toBe(3);
    expect(await prisma.product.findUnique({ where: { sku: newSku } })).toBeNull();

    // 2. Commit import with validation errors must NOT mutate DB (all-or-nothing gate)
    const blockedCommit = await runCatalogueImport(
      actor,
      { isDryRun: false, idempotencyKey: `blocked-commit-${Date.now()}` },
      mockClient,
      prisma,
    );
    expect(blockedCommit.ok).toBe(true);
    if (!blockedCommit.ok) return;
    createdJobIds.push(blockedCommit.syncJobId);
    expect(blockedCommit.failedRows).toBe(3);
    expect(await prisma.product.findUnique({ where: { sku: newSku } })).toBeNull();

    // 3. Remove invalid/duplicate rows and commit valid import
    mockClient.rows = [[...CATALOGUE_SHEET_HEADERS], existingRow, newRow];
    const commitKey = `commit-${Date.now()}`;
    const commitRes = await runCatalogueImport(
      actor,
      { isDryRun: false, idempotencyKey: commitKey },
      mockClient,
      prisma,
    );
    expect(commitRes.ok).toBe(true);
    if (!commitRes.ok) return;
    createdJobIds.push(commitRes.syncJobId);
    expect(commitRes.createdRows).toBe(1);
    expect(commitRes.updatedRows).toBe(1);
    expect(commitRes.failedRows).toBe(0);

    const createdProduct = await prisma.product.findUniqueOrThrow({ where: { sku: newSku } });
    expect(createdProduct.name).toBe("Phase 14 Test Chronometer");
    expect(createdProduct.pricePaise).toBe(5800000);

    const updatedExisting = await prisma.product.findUniqueOrThrow({
      where: { id: existingProduct.id },
    });
    expect(updatedExisting.name).toBe(`${existingProduct.name} Updated`);

    // Deleted sheet rows must NOT delete PostgreSQL products
    expect(await prisma.product.count()).toBe(originalProductCount + 1);

    // 4. Conflict detection: existingProduct.updatedAt is now > conn.lastExportedAt
    const conflictDryRun = await runCatalogueImport(
      actor,
      { isDryRun: true, idempotencyKey: `conflict-dry-${Date.now()}` },
      mockClient,
      prisma,
    );
    expect(conflictDryRun.ok).toBe(true);
    if (conflictDryRun.ok) {
      createdJobIds.push(conflictDryRun.syncJobId);
      expect(conflictDryRun.failedRows).toBeGreaterThanOrEqual(1);
    }

    // Restore original product name so seeded DB stays clean
    await prisma.product.update({
      where: { id: existingProduct.id },
      data: { name: existingProduct.name },
    });

    // Idempotent replay returns same job
    const replay = await runCatalogueImport(
      actor,
      { isDryRun: false, idempotencyKey: commitKey },
      mockClient,
      prisma,
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.syncJobId).toBe(commitRes.syncJobId);
    }

    // Job detail check
    const detail = await getCatalogueSyncJobDetail(commitRes.syncJobId, prisma);
    expect(detail?.rowResults.length).toBe(2);

    // Disconnect connection
    const disconnected = await disconnectSheetsConnection(actor, prisma);
    expect(disconnected.ok).toBe(true);
  });
});
