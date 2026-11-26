import type { CatalogueSyncRowOperation, Prisma, PrismaClient, ProductStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditLog } from "../admin-audit-service";
import type { AuthenticatedAdmin } from "../admin-auth-service";
import { createAdminProduct, updateAdminProduct } from "../catalogue/admin-product-service";
import {
  adminProductInputSchema,
  normalizeSku,
  normalizeSlug,
  type AdminProductInput,
} from "../catalogue/catalogue-schemas";
import { hasAdminPermission } from "../rbac-catalogue";
import {
  httpGoogleSheetsClient,
  type GoogleSheetsClient,
} from "./google-sheets-client";
import {
  CATALOGUE_SHEET_HEADERS,
  MAX_CELL_LENGTH,
  MAX_IMPORT_ROWS,
  mapProductToSheetRow,
  parseGstPercentToBps,
  parseRupeesToPaise,
  spreadsheetConfigSchema,
  validateSheetHeaders,
} from "./sheets-mapper";

const CONNECTION_ID = "default";

export async function getSheetsConnection(prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  return prisma.googleSheetsConnection.findUnique({ where: { id: CONNECTION_ID } });
}

export async function getSheetsSyncDashboardMetrics(prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  const [connection, jobs, failedCount] = await Promise.all([
    getSheetsConnection(prisma),
    prisma.catalogueSyncJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 15,
      include: {
        startedByAdmin: { include: { user: { select: { name: true, email: true } } } },
      },
    }),
    prisma.catalogueSyncJob.count({ where: { status: { in: ["FAILED", "COMPLETED_WITH_ERRORS"] } } }),
  ]);

  const totalExportedRows = jobs
    .filter((j) => j.direction === "EXPORT" && j.status === "COMPLETED")
    .reduce((acc, j) => acc + j.totalRows, 0);
  const totalImportedRows = jobs
    .filter((j) => j.direction === "IMPORT" && !j.isDryRun && j.status === "COMPLETED")
    .reduce((acc, j) => acc + j.createdRows + j.updatedRows, 0);

  return {
    connection,
    jobs,
    failedCount,
    totalExportedRows,
    totalImportedRows,
  };
}

export async function getCatalogueSyncJobDetail(syncJobId: string, prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  return prisma.catalogueSyncJob.findUnique({
    where: { id: syncJobId },
    include: {
      startedByAdmin: { include: { user: { select: { name: true, email: true } } } },
      rowResults: { orderBy: { rowNumber: "asc" } },
    },
  });
}

export async function saveSheetsConnection(
  actor: AuthenticatedAdmin,
  rawInput: { spreadsheetId: string; worksheetName: string },
  client: GoogleSheetsClient = httpGoogleSheetsClient,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const parsed = spreadsheetConfigSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid spreadsheet config." };
  }
  const { spreadsheetId, worksheetName } = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  try {
    const verified = await client.verifySpreadsheetAccess(spreadsheetId, worksheetName);
    await prisma.googleSheetsConnection.upsert({
      where: { id: CONNECTION_ID },
      create: {
        id: CONNECTION_ID,
        spreadsheetId,
        worksheetName,
        isActive: true,
        lastConnectedAt: new Date(),
        updatedByAdminId: actor.adminId,
      },
      update: {
        spreadsheetId,
        worksheetName,
        isActive: true,
        lastConnectedAt: new Date(),
        updatedByAdminId: actor.adminId,
      },
    });

    await recordAdminAuditLog(
      {
        actorAdminId: actor.adminId,
        action: "SHEETS_CONNECTION_SAVED",
        targetType: "GoogleSheetsConnection",
        targetId: CONNECTION_ID,
        success: true,
        metadata: { spreadsheetId, worksheetName },
      },
      prisma,
    );

    return { ok: true, title: verified.title };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to verify Google Sheets access.",
    };
  }
}

export async function disconnectSheetsConnection(
  actor: AuthenticatedAdmin,
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  await prisma.googleSheetsConnection.updateMany({
    where: { id: CONNECTION_ID },
    data: { isActive: false, updatedByAdminId: actor.adminId },
  });
  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "SHEETS_CONNECTION_DISCONNECTED",
      targetType: "GoogleSheetsConnection",
      targetId: CONNECTION_ID,
      success: true,
    },
    prisma,
  );
  return { ok: true };
}

export async function exportCatalogueToSheets(
  actor: AuthenticatedAdmin,
  idempotencyKey: string,
  client: GoogleSheetsClient = httpGoogleSheetsClient,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; syncJobId: string; totalRows: number } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  const existing = await prisma.catalogueSyncJob.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { ok: true, syncJobId: existing.id, totalRows: existing.totalRows };
  }

  const conn = await getSheetsConnection(prisma);
  if (!conn || !conn.isActive) {
    return { ok: false, error: "Google Sheets connection is not configured or active." };
  }

  const job = await prisma.catalogueSyncJob.create({
    data: {
      direction: "EXPORT",
      spreadsheetId: conn.spreadsheetId,
      worksheetName: conn.worksheetName,
      status: "RUNNING",
      isDryRun: false,
      startedByAdminId: actor.adminId,
      idempotencyKey,
    },
  });

  try {
    const products = await prisma.product.findMany({
      orderBy: { sku: "asc" },
      include: {
        brand: { select: { name: true } },
        categories: { include: { category: { select: { slug: true } } } },
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
      },
    });

    const values: (string | number | boolean)[][] = [
      [...CATALOGUE_SHEET_HEADERS],
      ...products.map(mapProductToSheetRow),
    ];

    const range = `${conn.worksheetName}!A1:X${Math.max(2, values.length + 20)}`;
    await client.clearRange(conn.spreadsheetId, range);
    await client.writeRange(conn.spreadsheetId, `${conn.worksheetName}!A1`, values);

    const now = new Date();
    await prisma.$transaction([
      prisma.googleSheetsConnection.update({
        where: { id: conn.id },
        data: { lastExportedAt: now },
      }),
      prisma.catalogueSyncJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          totalRows: products.length,
        },
      }),
    ]);

    await recordAdminAuditLog(
      {
        actorAdminId: actor.adminId,
        action: "SHEETS_CATALOGUE_EXPORT",
        targetType: "CatalogueSyncJob",
        targetId: job.id,
        success: true,
        metadata: { totalRows: products.length },
      },
      prisma,
    );

    return { ok: true, syncJobId: job.id, totalRows: products.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalogue export failed.";
    await prisma.catalogueSyncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), lastError: message },
    });
    return { ok: false, error: message };
  }
}

interface ParsedRowOutcome {
  rowNumber: number;
  sku: string;
  operation: CatalogueSyncRowOperation;
  status: string;
  errors: string[];
  existingProductId?: string;
  previousValues?: Record<string, unknown>;
  proposedValues?: AdminProductInput;
}

export async function runCatalogueImport(
  actor: AuthenticatedAdmin,
  params: { isDryRun: boolean; idempotencyKey: string },
  client: GoogleSheetsClient = httpGoogleSheetsClient,
  prismaClient?: PrismaClient,
): Promise<
  | {
      ok: true;
      syncJobId: string;
      isDryRun: boolean;
      totalRows: number;
      createdRows: number;
      updatedRows: number;
      unchangedRows: number;
      failedRows: number;
    }
  | { ok: false; error: string }
> {
  const prisma = prismaClient ?? getPrisma();
  const existing = await prisma.catalogueSyncJob.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) {
    return {
      ok: true,
      syncJobId: existing.id,
      isDryRun: existing.isDryRun,
      totalRows: existing.totalRows,
      createdRows: existing.createdRows,
      updatedRows: existing.updatedRows,
      unchangedRows: existing.unchangedRows,
      failedRows: existing.failedRows,
    };
  }

  const conn = await getSheetsConnection(prisma);
  if (!conn || !conn.isActive) {
    return { ok: false, error: "Google Sheets connection is not configured or active." };
  }

  const job = await prisma.catalogueSyncJob.create({
    data: {
      direction: "IMPORT",
      spreadsheetId: conn.spreadsheetId,
      worksheetName: conn.worksheetName,
      status: "RUNNING",
      isDryRun: params.isDryRun,
      startedByAdminId: actor.adminId,
      idempotencyKey: params.idempotencyKey,
    },
  });

  try {
    const rawRows = await client.readRange(
      conn.spreadsheetId,
      `${conn.worksheetName}!A1:X${MAX_IMPORT_ROWS + 1}`,
    );
    if (rawRows.length === 0) {
      throw new Error("Worksheet is empty.");
    }

    const headerCheck = validateSheetHeaders(rawRows[0] ?? []);
    if (!headerCheck.ok) {
      throw new Error(headerCheck.error);
    }

    const dataRows = rawRows.slice(1).filter((r) => r.some((cell) => cell.trim().length > 0));
    if (dataRows.length > MAX_IMPORT_ROWS) {
      throw new Error(`Import exceeds maximum limit of ${MAX_IMPORT_ROWS} rows.`);
    }

    const [brands, categories, existingProducts] = await Promise.all([
      prisma.brand.findMany(),
      prisma.category.findMany(),
      prisma.product.findMany({
        include: {
          categories: { select: { categoryId: true } },
          images: { orderBy: { sortOrder: "asc" } },
        },
      }),
    ]);

    const brandByKey = new Map<string, (typeof brands)[number]>();
    for (const b of brands) {
      brandByKey.set(b.name.trim().toLowerCase(), b);
      brandByKey.set(b.slug.trim().toLowerCase(), b);
    }

    const categoryByKey = new Map<string, (typeof categories)[number]>();
    for (const c of categories) {
      categoryByKey.set(c.slug.trim().toLowerCase(), c);
      categoryByKey.set(c.name.trim().toLowerCase(), c);
    }

    const productBySku = new Map<string, (typeof existingProducts)[number]>();
    for (const p of existingProducts) {
      productBySku.set(normalizeSku(p.sku), p);
    }

    const skuCounts = new Map<string, number>();
    for (const r of dataRows) {
      const sku = normalizeSku(r[0] ?? "");
      if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    }

    const canPublish = hasAdminPermission(actor.permissions, "catalogue.publish");
    const outcomes: ParsedRowOutcome[] = [];

    for (let idx = 0; idx < dataRows.length; idx++) {
      const row = dataRows[idx] ?? [];
      const rowNumber = idx + 2;
      const cell = (col: number) => (row[col] ?? "").trim();
      const errors: string[] = [];

      if (row.some((c) => c.length > MAX_CELL_LENGTH)) {
        errors.push(`One or more cells exceed ${MAX_CELL_LENGTH} characters.`);
      }

      const sku = normalizeSku(cell(0));
      if (!sku) errors.push("SKU is required.");
      if (sku && (skuCounts.get(sku) ?? 0) > 1) {
        errors.push(`Duplicate SKU "${sku}" in spreadsheet.`);
      }

      const existingProd = sku ? productBySku.get(sku) : undefined;
      if (
        existingProd &&
        conn.lastExportedAt &&
        existingProd.updatedAt.getTime() > conn.lastExportedAt.getTime()
      ) {
        errors.push(
          `Conflict: "${sku}" was modified in WatchStore Admin after the last export.`,
        );
      }

      const name = cell(1) || existingProd?.name || "";
      const slug = normalizeSlug(cell(2) || existingProd?.slug || name);

      const brandInput = cell(3).toLowerCase();
      const matchedBrand = brandInput
        ? brandByKey.get(brandInput)
        : existingProd
          ? brands.find((b) => b.id === existingProd.brandId)
          : undefined;
      if (!matchedBrand) {
        errors.push(`Unknown brand "${cell(3)}".`);
      }

      const catCell = cell(4);
      let categoryIds: string[] = existingProd?.categories.map((c) => c.categoryId) ?? [];
      if (catCell) {
        const tokens = catCell
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        const resolved: string[] = [];
        for (const t of tokens) {
          const cat = categoryByKey.get(t);
          if (!cat) errors.push(`Unknown category "${t}".`);
          else resolved.push(cat.id);
        }
        categoryIds = resolved;
      }

      const gender = (cell(5).toLowerCase() || existingProd?.gender || "") as
        | "men"
        | "women"
        | "unisex";
      const watchType = (cell(6).toLowerCase() || existingProd?.watchType || "") as
        | "chronograph"
        | "automatic"
        | "dress"
        | "diver";
      const strapMaterial = (cell(7).toLowerCase() || existingProd?.strapMaterial || "") as
        | "steel"
        | "leather"
        | "mesh";

      const dialAndStrap = cell(8) || existingProd?.dialAndStrap || "";
      const description = cell(9) || existingProd?.description || "";
      const specMovement = cell(10) || existingProd?.specMovement || "";
      const specCaseDimensions = cell(11) || existingProd?.specCaseDimensions || "";
      const specCrystal = cell(12) || existingProd?.specCrystal || "";
      const specWaterResistance = cell(13) || existingProd?.specWaterResistance || "";
      const specHsn = cell(14) || existingProd?.specHsn || "";

      const mrpPaise = cell(15) ? parseRupeesToPaise(cell(15)) : (existingProd?.mrpPaise ?? null);
      if (mrpPaise === null) errors.push("Invalid MRP amount.");

      const pricePaise = cell(16)
        ? parseRupeesToPaise(cell(16))
        : (existingProd?.pricePaise ?? null);
      if (pricePaise === null) errors.push("Invalid Selling Price amount.");

      const gstRateBps = cell(17)
        ? parseGstPercentToBps(cell(17))
        : (existingProd?.gstRateBps ?? null);
      if (gstRateBps === null) errors.push("Invalid GST percentage.");

      const badgeRaw = cell(18).toLowerCase();
      const badge = badgeRaw
        ? (badgeRaw as "best_seller" | "new_arrival" | "limited")
        : (existingProd?.badge ?? null);

      const bestSellerRaw = cell(19).toUpperCase();
      const isBestSeller = bestSellerRaw
        ? bestSellerRaw === "TRUE" || bestSellerRaw === "YES" || bestSellerRaw === "1"
        : (existingProd?.isBestSeller ?? false);

      const warrantyRaw = cell(20);
      const warrantyYears = warrantyRaw
        ? Number(warrantyRaw)
        : (existingProd?.warrantyYears ?? null);

      const requestedStatus = (cell(21).toUpperCase() ||
        (existingProd ? existingProd.status : "DRAFT")) as ProductStatus;

      if (
        requestedStatus === "PUBLISHED" &&
        (!existingProd || existingProd.status !== "PUBLISHED") &&
        !canPublish
      ) {
        errors.push("You do not have catalogue.publish permission to publish products.");
      }

      const primaryImgUrl = cell(22);
      const images = primaryImgUrl
        ? [
            { url: primaryImgUrl, alt: name || sku },
            ...(existingProd?.images.slice(1).map((i) => ({ url: i.url, alt: i.alt })) ?? []),
          ]
        : (existingProd?.images.map((i) => ({ url: i.url, alt: i.alt })) ?? []);

      const candidate: AdminProductInput = {
        name,
        slug,
        sku,
        brandId: matchedBrand?.id ?? "",
        categoryIds,
        gender,
        watchType,
        strapMaterial,
        dialAndStrap,
        description,
        specMovement,
        specCaseDimensions,
        specCrystal,
        specWaterResistance,
        specHsn,
        mrpPaise: mrpPaise ?? 0,
        pricePaise: pricePaise ?? 0,
        gstRateBps: gstRateBps ?? 1800,
        badge,
        isBestSeller,
        warrantyYears: Number.isFinite(warrantyYears) ? warrantyYears : null,
        status: requestedStatus,
        images,
      };

      const schemaCheck = adminProductInputSchema.safeParse(candidate);
      if (!schemaCheck.success) {
        for (const issue of schemaCheck.error.issues) {
          errors.push(issue.message);
        }
      }

      if (errors.length > 0 || !schemaCheck.success) {
        outcomes.push({
          rowNumber,
          sku: sku || `ROW-${rowNumber}`,
          operation: "ERROR",
          status: "INVALID",
          errors,
        });
        continue;
      }

      const validProposed = schemaCheck.data;

      if (!existingProd) {
        outcomes.push({
          rowNumber,
          sku,
          operation: "CREATE",
          status: params.isDryRun ? "DRY_RUN_CREATE" : "PENDING_CREATE",
          errors: [],
          proposedValues: validProposed,
        });
      } else {
        const changed =
          existingProd.name !== validProposed.name ||
          existingProd.pricePaise !== validProposed.pricePaise ||
          existingProd.mrpPaise !== validProposed.mrpPaise ||
          existingProd.gstRateBps !== validProposed.gstRateBps ||
          existingProd.description !== validProposed.description ||
          existingProd.status !== validProposed.status ||
          existingProd.brandId !== validProposed.brandId;

        outcomes.push({
          rowNumber,
          sku,
          operation: changed ? "UPDATE" : "UNCHANGED",
          status: changed
            ? params.isDryRun
              ? "DRY_RUN_UPDATE"
              : "PENDING_UPDATE"
            : "UNCHANGED",
          errors: [],
          existingProductId: existingProd.id,
          previousValues: {
            name: existingProd.name,
            pricePaise: existingProd.pricePaise,
            mrpPaise: existingProd.mrpPaise,
            status: existingProd.status,
          },
          proposedValues: schemaCheck.data,
        });
      }
    }

    let createdRows = 0;
    let updatedRows = 0;
    let unchangedRows = 0;
    let failedRows = outcomes.filter((o) => o.operation === "ERROR").length;

    if (!params.isDryRun && failedRows === 0) {
      for (const o of outcomes) {
        if (o.operation === "CREATE" && o.proposedValues) {
          const res = await createAdminProduct(actor, o.proposedValues, prisma);
          if (!res.ok) {
            o.operation = "ERROR";
            o.status = "FAILED";
            o.errors.push(res.error);
            failedRows += 1;
          } else {
            o.status = "CREATED";
            createdRows += 1;
          }
        } else if (o.operation === "UPDATE" && o.existingProductId && o.proposedValues) {
          const res = await updateAdminProduct(actor, o.existingProductId, o.proposedValues, prisma);
          if (!res.ok) {
            o.operation = "ERROR";
            o.status = "FAILED";
            o.errors.push(res.error);
            failedRows += 1;
          } else {
            o.status = "UPDATED";
            updatedRows += 1;
          }
        } else if (o.operation === "UNCHANGED") {
          unchangedRows += 1;
        }
      }
    } else {
      createdRows = outcomes.filter((o) => o.operation === "CREATE").length;
      updatedRows = outcomes.filter((o) => o.operation === "UPDATE").length;
      unchangedRows = outcomes.filter((o) => o.operation === "UNCHANGED").length;
    }

    const finalStatus =
      failedRows > 0
        ? params.isDryRun
          ? "COMPLETED_WITH_ERRORS"
          : "FAILED"
        : "COMPLETED";

    await prisma.$transaction(async (tx) => {
      await tx.catalogueSyncRowResult.createMany({
        data: outcomes.map((o) => ({
          syncJobId: job.id,
          rowNumber: o.rowNumber,
          sku: o.sku,
          operation: o.operation,
          status: o.status,
          validationErrors: o.errors.length > 0 ? (o.errors as unknown as Prisma.InputJsonValue) : undefined,
          previousValues: o.previousValues as Prisma.InputJsonValue | undefined,
          proposedValues: o.proposedValues as unknown as Prisma.InputJsonValue | undefined,
        })),
      });

      await tx.catalogueSyncJob.update({
        where: { id: job.id },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          totalRows: outcomes.length,
          createdRows,
          updatedRows,
          unchangedRows,
          failedRows,
        },
      });

      if (!params.isDryRun && failedRows === 0) {
        await tx.googleSheetsConnection.update({
          where: { id: conn.id },
          data: { lastImportedAt: new Date() },
        });
      }
    });

    await recordAdminAuditLog(
      {
        actorAdminId: actor.adminId,
        action: params.isDryRun ? "SHEETS_IMPORT_DRY_RUN" : "SHEETS_CATALOGUE_IMPORT",
        targetType: "CatalogueSyncJob",
        targetId: job.id,
        success: failedRows === 0,
        metadata: { totalRows: outcomes.length, createdRows, updatedRows, unchangedRows, failedRows },
      },
      prisma,
    );

    return {
      ok: true,
      syncJobId: job.id,
      isDryRun: params.isDryRun,
      totalRows: outcomes.length,
      createdRows,
      updatedRows,
      unchangedRows,
      failedRows,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalogue import failed.";
    await prisma.catalogueSyncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), lastError: message },
    });
    return { ok: false, error: message };
  }
}
