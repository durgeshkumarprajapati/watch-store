import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { loadMigrationConfig } from "./config";
import { buildIdentityMappings, remapNullableId } from "./mappings";

function toJsonInput(v: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
}

interface TablePlan {
  table: string;
  level: number;
  pkField: string;
  sourceCount: number;
  destExistingCount: number;
  expectedInserts: number;
  expectedSkips: number;
  fkRemaps: number;
  note?: string;
  rows: Record<string, unknown>[];
  insertBatch: (dest: PrismaClient, batch: Record<string, unknown>[]) => Promise<number>;
}

interface CheckpointState {
  completedTables: string[];
  updatedAt: string;
}

const PRESERVED_TABLES = [
  "AdminPermission",
  "AdminRole",
  "AdminRolePermission",
  "User",
  "AdminUser",
  "AdminUserRole",
  "AuthActionToken",
] as const;

function loadCheckpoint(filePath: string, resume: boolean): Set<string> {
  if (!resume || !fs.existsSync(filePath)) return new Set();
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as CheckpointState;
  return new Set(parsed.completedTables ?? []);
}

function saveCheckpoint(filePath: string, completed: Set<string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload: CheckpointState = {
    completedTables: Array.from(completed),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function sortCategoriesParentFirst<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const visited = new Set<string>();
  const ordered: T[] = [];
  function visit(row: T) {
    if (visited.has(row.id)) return;
    if (row.parentId && byId.has(row.parentId)) {
      visit(byId.get(row.parentId)!);
    }
    visited.add(row.id);
    ordered.push(row);
  }
  for (const r of rows) visit(r);
  return ordered;
}

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delayMs = attempt * 1000;
        console.warn(`[RETRY ${attempt}/${retries}] ${label} failed, retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

async function main() {
  const config = loadMigrationConfig(process.argv.slice(2));
  const source = new PrismaClient({ datasources: { db: { url: config.sourceUrl } } });
  const dest = new PrismaClient({ datasources: { db: { url: config.destUrl } } });

  try {
    console.log(`=== WatchStore Local -> Supabase Migration (${config.dryRun ? "DRY-RUN" : "EXECUTE"}) ===`);
    console.log(`Batch size: ${config.batchSize} | Resume: ${config.resume}`);

    const mappings = await buildIdentityMappings(source, dest);
    console.log("User ID mappings:", mappings.userEmailConflicts);
    console.log("Admin ID mappings:", mappings.adminConflicts);
    console.log("Customer ID mappings:", mappings.customerEmailConflicts);
    console.log(
      `RBAC mappings verified: ${mappings.roleIdMap.size} roles, ${mappings.permissionIdMap.size} permissions`
    );

    // Fetch existing destination PK sets (read-only) to compute exact dry-run inserts vs skips
    const [
      destBrandIds,
      destCategoryIds,
      destMediaIds,
      destCustomerIds,
      destProductIds,
      destProdCatIds,
      destProdImgIds,
      destProdStockIds,
      destStockAdjIds,
      destOrderIds,
      destSyncJobIds,
      destSheetsIds,
      destAuditIds,
      destSyncRowIds,
      destAddrSnapIds,
      destOrderItemIds,
      destOrderHistIds,
      destPaymentIds,
      destNotifIds,
      destInvResIds,
      destPayAttIds,
      destNotifJobIds,
    ] = await Promise.all([
      dest.brand.findMany({ select: { id: true } }),
      dest.category.findMany({ select: { id: true } }),
      dest.mediaCleanupJob.findMany({ select: { id: true } }),
      dest.customer.findMany({ select: { id: true } }),
      dest.product.findMany({ select: { id: true } }),
      dest.productCategory.findMany({ select: { productId: true, categoryId: true } }),
      dest.productImage.findMany({ select: { id: true } }),
      dest.productStock.findMany({ select: { productId: true } }),
      dest.stockAdjustment.findMany({ select: { id: true } }),
      dest.order.findMany({ select: { id: true } }),
      dest.catalogueSyncJob.findMany({ select: { id: true } }),
      dest.googleSheetsConnection.findMany({ select: { id: true } }),
      dest.adminAuditLog.findMany({ select: { id: true } }),
      dest.catalogueSyncRowResult.findMany({ select: { id: true } }),
      dest.orderAddressSnapshot.findMany({ select: { id: true } }),
      dest.orderItem.findMany({ select: { id: true } }),
      dest.orderStatusHistory.findMany({ select: { id: true } }),
      dest.payment.findMany({ select: { id: true } }),
      dest.notification.findMany({ select: { id: true } }),
      dest.inventoryReservation.findMany({ select: { id: true } }),
      dest.paymentAttempt.findMany({ select: { id: true } }),
      dest.notificationJob.findMany({ select: { id: true } }),
    ]);

    // Fetch source rows in dependency order
    const [
      brands,
      categoriesRaw,
      mediaJobs,
      customersRaw,
      products,
      productCategories,
      productImages,
      productStocks,
      stockAdjustmentsRaw,
      ordersRaw,
      syncJobsRaw,
      sheetsConnsRaw,
      auditLogsRaw,
      syncRowResults,
      orderAddrSnapshots,
      orderItems,
      orderStatusHistoriesRaw,
      payments,
      notifications,
      inventoryReservations,
      paymentAttempts,
      notificationJobs,
    ] = await Promise.all([
      source.brand.findMany(),
      source.category.findMany(),
      source.mediaCleanupJob.findMany(),
      source.customer.findMany(),
      source.product.findMany(),
      source.productCategory.findMany(),
      source.productImage.findMany(),
      source.productStock.findMany(),
      source.stockAdjustment.findMany(),
      source.order.findMany(),
      source.catalogueSyncJob.findMany(),
      source.googleSheetsConnection.findMany(),
      source.adminAuditLog.findMany(),
      source.catalogueSyncRowResult.findMany(),
      source.orderAddressSnapshot.findMany(),
      source.orderItem.findMany(),
      source.orderStatusHistory.findMany(),
      source.payment.findMany(),
      source.notification.findMany(),
      source.inventoryReservation.findMany(),
      source.paymentAttempt.findMany(),
      source.notificationJob.findMany(),
    ]);

    const categories = sortCategoriesParentFirst(categoriesRaw);

    let customerFkRemaps = 0;
    const customersToInsert = customersRaw
      .filter((c) => !mappings.customerIdMap.has(c.id))
      .map((c) => {
        const mapped = remapNullableId(c.authUserId, mappings.userIdMap, "Customer.authUserId");
        if (mapped !== c.authUserId) customerFkRemaps++;
        return { ...c, authUserId: mapped };
      });
    const customerEmailSkipCount = customersRaw.length - customersToInsert.length;

    let stockAdjFkRemaps = 0;
    const stockAdjustments = stockAdjustmentsRaw.map((s) => {
      const mapped = remapNullableId(s.actorAdminId, mappings.adminIdMap, "StockAdjustment.actorAdminId");
      if (mapped !== s.actorAdminId) stockAdjFkRemaps++;
      return { ...s, actorAdminId: mapped };
    });

    let orderFkRemaps = 0;
    const orders = ordersRaw.map((o) => {
      const mappedAdmin = remapNullableId(o.packedByAdminId, mappings.adminIdMap, "Order.packedByAdminId");
      if (mappedAdmin !== o.packedByAdminId) orderFkRemaps++;
      const mappedCustomer = o.customerId ? (mappings.customerIdMap.get(o.customerId) ?? o.customerId) : null;
      if (mappedCustomer !== o.customerId) orderFkRemaps++;
      return { ...o, packedByAdminId: mappedAdmin, customerId: mappedCustomer };
    });

    let syncJobFkRemaps = 0;
    const syncJobs = syncJobsRaw.map((j) => {
      const mapped = remapNullableId(j.startedByAdminId, mappings.adminIdMap, "CatalogueSyncJob.startedByAdminId");
      if (mapped !== j.startedByAdminId) syncJobFkRemaps++;
      return { ...j, startedByAdminId: mapped };
    });

    let sheetsFkRemaps = 0;
    const sheetsConns = sheetsConnsRaw.map((g) => {
      const mapped = remapNullableId(g.updatedByAdminId, mappings.adminIdMap, "GoogleSheetsConnection.updatedByAdminId");
      if (mapped !== g.updatedByAdminId) sheetsFkRemaps++;
      return { ...g, updatedByAdminId: mapped };
    });

    let auditFkRemaps = 0;
    const auditLogs = auditLogsRaw.map((a) => {
      const mapped = remapNullableId(a.actorAdminId, mappings.adminIdMap, "AdminAuditLog.actorAdminId");
      if (mapped !== a.actorAdminId) auditFkRemaps++;
      return { ...a, actorAdminId: mapped };
    });

    let orderHistFkRemaps = 0;
    const orderStatusHistories = orderStatusHistoriesRaw.map((h) => {
      const mapped = remapNullableId(h.actorAdminId, mappings.adminIdMap, "OrderStatusHistory.actorAdminId");
      if (mapped !== h.actorAdminId) orderHistFkRemaps++;
      return { ...h, actorAdminId: mapped };
    });

    let notifFkRemaps = 0;
    const notificationsMapped = notifications.map((n) => {
      const mappedCustomer = n.customerId ? (mappings.customerIdMap.get(n.customerId) ?? n.customerId) : null;
      if (mappedCustomer !== n.customerId) notifFkRemaps++;
      return { ...n, customerId: mappedCustomer, payload: toJsonInput(n.payload) };
    });

    const mkPlan = <T extends Record<string, unknown>>(
      table: string,
      level: number,
      pkField: string,
      rows: T[],
      destSet: Set<string>,
      fkRemaps: number,
      insertFn: (d: PrismaClient, batch: T[]) => Promise<{ count: number }>,
      note?: string
    ): TablePlan => {
      const existing = rows.filter((r) => destSet.has(String(r[pkField]))).length;
      return {
        table,
        level,
        pkField,
        sourceCount: rows.length,
        destExistingCount: destSet.size,
        expectedInserts: rows.length - existing,
        expectedSkips: existing,
        fkRemaps,
        note,
        rows,
        insertBatch: async (d, batch) => {
          const res = await insertFn(d, batch as T[]);
          return res.count;
        },
      };
    };

    const plans: TablePlan[] = [
      // Level 0
      mkPlan("Brand", 0, "id", brands, new Set(destBrandIds.map((x) => x.id)), 0, (d, b) => d.brand.createMany({ data: b, skipDuplicates: true })),
      mkPlan("Category", 0, "id", categories, new Set(destCategoryIds.map((x) => x.id)), 0, (d, b) => d.category.createMany({ data: b, skipDuplicates: true })),
      mkPlan("MediaCleanupJob", 0, "id", mediaJobs, new Set(destMediaIds.map((x) => x.id)), 0, (d, b) => d.mediaCleanupJob.createMany({ data: b, skipDuplicates: true })),
      // Level 1
      {
        table: "Customer",
        level: 1,
        pkField: "id",
        sourceCount: customersRaw.length,
        destExistingCount: destCustomerIds.length,
        expectedInserts: customersToInsert.filter(
          (r) => !destCustomerIds.some((d) => d.id === r.id)
        ).length,
        expectedSkips:
          customerEmailSkipCount +
          customersToInsert.filter((r) => destCustomerIds.some((d) => d.id === r.id)).length,
        fkRemaps: customerFkRemaps,
        note: "Preserves existing Supabase Customer by email; remaps authUserId",
        rows: customersToInsert as unknown as Record<string, unknown>[],
        insertBatch: async (d, batch) => {
          const res = await d.customer.createMany({
            data: batch as Prisma.CustomerCreateManyInput[],
            skipDuplicates: true,
          });
          return res.count;
        },
      },
      mkPlan("Product", 1, "id", products, new Set(destProductIds.map((x) => x.id)), 0, (d, b) => d.product.createMany({ data: b, skipDuplicates: true })),
      // Level 2
      {
        table: "ProductCategory",
        level: 2,
        pkField: "productId",
        sourceCount: productCategories.length,
        destExistingCount: destProdCatIds.length,
        expectedInserts: productCategories.filter(
          (r) => !destProdCatIds.some((d) => d.productId === r.productId && d.categoryId === r.categoryId)
        ).length,
        expectedSkips: productCategories.filter(
          (r) => destProdCatIds.some((d) => d.productId === r.productId && d.categoryId === r.categoryId)
        ).length,
        fkRemaps: 0,
        rows: productCategories as unknown as Record<string, unknown>[],
        insertBatch: async (d, batch) => {
          const res = await d.productCategory.createMany({
            data: batch as Prisma.ProductCategoryCreateManyInput[],
            skipDuplicates: true,
          });
          return res.count;
        },
      },
      mkPlan("ProductImage", 2, "id", productImages, new Set(destProdImgIds.map((x) => x.id)), 0, (d, b) => d.productImage.createMany({ data: b, skipDuplicates: true })),
      mkPlan("ProductStock", 2, "productId", productStocks, new Set(destProdStockIds.map((x) => x.productId)), 0, (d, b) => d.productStock.createMany({ data: b, skipDuplicates: true }), "Preserves 7 seeded reserved > 0 values"),
      mkPlan("StockAdjustment", 2, "id", stockAdjustments, new Set(destStockAdjIds.map((x) => x.id)), stockAdjFkRemaps, (d, b) => d.stockAdjustment.createMany({ data: b, skipDuplicates: true })),
      mkPlan("Order", 2, "id", orders, new Set(destOrderIds.map((x) => x.id)), orderFkRemaps, (d, b) => d.order.createMany({ data: b, skipDuplicates: true }), "Remaps packedByAdminId"),
      mkPlan("CatalogueSyncJob", 2, "id", syncJobs, new Set(destSyncJobIds.map((x) => x.id)), syncJobFkRemaps, (d, b) => d.catalogueSyncJob.createMany({ data: b, skipDuplicates: true }), "Remaps startedByAdminId"),
      mkPlan("GoogleSheetsConnection", 2, "id", sheetsConns, new Set(destSheetsIds.map((x) => x.id)), sheetsFkRemaps, (d, b) => d.googleSheetsConnection.createMany({ data: b, skipDuplicates: true }), "Remaps updatedByAdminId"),
      mkPlan(
        "AdminAuditLog",
        2,
        "id",
        auditLogs.map((a) => ({ ...a, metadata: toJsonInput(a.metadata) })),
        new Set(destAuditIds.map((x) => x.id)),
        auditFkRemaps,
        (d, b) => d.adminAuditLog.createMany({ data: b, skipDuplicates: true }),
        "Appends alongside preserved Supabase log"
      ),
      // Level 3
      mkPlan(
        "CatalogueSyncRowResult",
        3,
        "id",
        syncRowResults.map((r) => ({
          ...r,
          validationErrors: toJsonInput(r.validationErrors),
          previousValues: toJsonInput(r.previousValues),
          proposedValues: toJsonInput(r.proposedValues),
        })),
        new Set(destSyncRowIds.map((x) => x.id)),
        0,
        (d, b) => d.catalogueSyncRowResult.createMany({ data: b, skipDuplicates: true })
      ),
      mkPlan("OrderAddressSnapshot", 3, "id", orderAddrSnapshots, new Set(destAddrSnapIds.map((x) => x.id)), 0, (d, b) => d.orderAddressSnapshot.createMany({ data: b, skipDuplicates: true })),
      mkPlan("OrderItem", 3, "id", orderItems, new Set(destOrderItemIds.map((x) => x.id)), 0, (d, b) => d.orderItem.createMany({ data: b, skipDuplicates: true })),
      mkPlan("OrderStatusHistory", 3, "id", orderStatusHistories, new Set(destOrderHistIds.map((x) => x.id)), orderHistFkRemaps, (d, b) => d.orderStatusHistory.createMany({ data: b, skipDuplicates: true }), "Remaps actorAdminId"),
      mkPlan("Payment", 3, "id", payments, new Set(destPaymentIds.map((x) => x.id)), 0, (d, b) => d.payment.createMany({ data: b, skipDuplicates: true })),
      mkPlan(
        "Notification",
        3,
        "id",
        notificationsMapped,
        new Set(destNotifIds.map((x) => x.id)),
        notifFkRemaps,
        (d, b) => d.notification.createMany({ data: b, skipDuplicates: true })
      ),
      // Level 4
      mkPlan("InventoryReservation", 4, "id", inventoryReservations, new Set(destInvResIds.map((x) => x.id)), 0, (d, b) => d.inventoryReservation.createMany({ data: b, skipDuplicates: true })),
      mkPlan(
        "PaymentAttempt",
        4,
        "id",
        paymentAttempts.map((pa) => ({ ...pa, gatewayMetadata: toJsonInput(pa.gatewayMetadata) })),
        new Set(destPayAttIds.map((x) => x.id)),
        0,
        (d, b) => d.paymentAttempt.createMany({ data: b, skipDuplicates: true })
      ),
      mkPlan("NotificationJob", 4, "id", notificationJobs, new Set(destNotifJobIds.map((x) => x.id)), 0, (d, b) => d.notificationJob.createMany({ data: b, skipDuplicates: true })),
    ];

    console.log("\n=== Table Migration Plan ===");
    let totalInserts = 0;
    let totalSkips = 0;
    let totalRemaps = 0;
    for (const p of plans) {
      totalInserts += p.expectedInserts;
      totalSkips += p.expectedSkips;
      totalRemaps += p.fkRemaps;
      console.log(
        `[L${p.level}] ${p.table.padEnd(24)} src=${String(p.sourceCount).padStart(3)} dest_existing=${String(p.destExistingCount).padStart(3)} inserts=${String(p.expectedInserts).padStart(3)} skips=${String(p.expectedSkips).padStart(3)} fk_remaps=${p.fkRemaps}${p.note ? ` (${p.note})` : ""}`
      );
    }

    console.log(`\nPreserved Supabase tables (untouched): ${PRESERVED_TABLES.join(", ")}`);
    console.log(`Skipped local tables: _prisma_migrations (already applied), ShiprocketAuthToken (1 expired 1970-01-01 placeholder), AuthActionToken (1 duplicate EMAIL_VERIFICATION token)`);
    console.log(`Totals -> Expected Inserts: ${totalInserts} | Expected Skips: ${totalSkips} | FK Remaps: ${totalRemaps}`);

    if (config.dryRun) {
      console.log("\nDRY-RUN COMPLETE: Zero destination writes performed.");
      return;
    }

    const completed = loadCheckpoint(config.checkpointFile, config.resume);
    console.log(`\nStarting live execution (checkpoint: ${config.checkpointFile})...`);

    for (const p of plans) {
      if (completed.has(p.table)) {
        console.log(`[SKIP-CHECKPOINT] ${p.table}`);
        continue;
      }
      let inserted = 0;
      for (let i = 0; i < p.rows.length; i += config.batchSize) {
        const batch = p.rows.slice(i, i + config.batchSize);
        const count = await withRetry(
          () => dest.$transaction((tx) => p.insertBatch(tx as unknown as PrismaClient, batch), { timeout: 30000 }),
          `${p.table} batch ${i}-${i + batch.length}`
        );
        inserted += count;
      }
      completed.add(p.table);
      saveCheckpoint(config.checkpointFile, completed);
      console.log(`[DONE] ${p.table}: inserted=${inserted}, skipped=${p.sourceCount - inserted}`);
    }

    console.log("\nMIGRATION EXECUTION COMPLETE.");
  } finally {
    await source.$disconnect();
    await dest.$disconnect();
  }
}

main().catch((err) => {
  console.error("MIGRATION_FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
