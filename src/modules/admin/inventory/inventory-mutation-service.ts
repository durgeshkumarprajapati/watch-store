import type { PrismaClient, StockAdjustmentReason } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditLog } from "../admin-audit-service";
import type { AuthenticatedAdmin } from "../admin-auth-service";
import { revalidateCataloguePaths } from "../catalogue/catalogue-revalidation";
import {
  lowStockThresholdSchema,
  stockAdjustmentSchema,
  stockInwardSchema,
  stockOutwardSchema,
  type LowStockThresholdInput,
  type StockAdjustmentInput,
  type StockInwardInput,
  type StockOutwardInput,
} from "./inventory-validation";

export type StockMutationResult =
  | {
      ok: true;
      idempotentReplay: boolean;
      adjustmentId: string;
      available: number;
      reserved: number;
      physicalStock: number;
    }
  | { ok: false; error: string };

class InventoryRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryRuleError";
  }
}

async function executeLockedStockMutation(params: {
  actor: AuthenticatedAdmin;
  productId: string;
  idempotencyKey: string;
  reason: StockAdjustmentReason;
  referenceId?: string;
  note: string;
  auditAction: string;
  computeNextAvailable: (current: { available: number; reserved: number }) => number;
  prismaClient?: PrismaClient;
}): Promise<StockMutationResult> {
  const prisma = params.prismaClient ?? getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingByKey = await tx.stockAdjustment.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existingByKey) {
        const stock = await tx.productStock.findUnique({
          where: { productId: existingByKey.productId },
        });
        const available = stock?.available ?? 0;
        const reserved = stock?.reserved ?? 0;
        return {
          idempotentReplay: true,
          adjustmentId: existingByKey.id,
          available,
          reserved,
          physicalStock: available + reserved,
          slug: "",
        };
      }

      const product = await tx.product.findUnique({
        where: { id: params.productId },
        select: { id: true, slug: true },
      });
      if (!product) {
        throw new InventoryRuleError("Product not found.");
      }

      // Ensure ProductStock row exists before acquiring row lock.
      await tx.productStock.upsert({
        where: { productId: params.productId },
        create: { productId: params.productId, available: 0, reserved: 0 },
        update: {},
      });

      const lockedRows = await tx.$queryRaw<{ available: number; reserved: number }[]>`
        SELECT "available", "reserved"
        FROM "ProductStock"
        WHERE "productId" = ${params.productId}
        FOR UPDATE
      `;
      const current = lockedRows[0];
      if (!current) {
        throw new InventoryRuleError("Product stock record not found.");
      }

      const nextAvailable = params.computeNextAvailable(current);
      if (!Number.isInteger(nextAvailable) || nextAvailable < 0) {
        throw new InventoryRuleError(
          `Operation would cause negative available stock (available: ${current.available}, reserved: ${current.reserved}).`,
        );
      }

      const previousPhysical = current.available + current.reserved;
      const newPhysical = nextAvailable + current.reserved;
      if (newPhysical < current.reserved) {
        throw new InventoryRuleError(
          `Physical stock (${newPhysical}) cannot be lower than reserved stock (${current.reserved}).`,
        );
      }

      const deltaAvailable = nextAvailable - current.available;
      if (deltaAvailable === 0) {
        throw new InventoryRuleError("Stock quantity is already at the requested level.");
      }

      await tx.productStock.update({
        where: { productId: params.productId },
        data: { available: nextAvailable },
      });

      const adjustment = await tx.stockAdjustment.create({
        data: {
          productId: params.productId,
          deltaAvailable,
          deltaReserved: 0,
          previousPhysical,
          newPhysical,
          reason: params.reason,
          referenceId: params.referenceId?.trim() || null,
          note: params.note,
          actorAdminId: params.actor.adminId,
          idempotencyKey: params.idempotencyKey,
        },
      });

      return {
        idempotentReplay: false,
        adjustmentId: adjustment.id,
        available: nextAvailable,
        reserved: current.reserved,
        physicalStock: newPhysical,
        slug: product.slug,
      };
    });

    if (!result.idempotentReplay) {
      await recordAdminAuditLog(
        {
          actorAdminId: params.actor.adminId,
          action: params.auditAction,
          targetType: "ProductStock",
          targetId: params.productId,
          success: true,
          metadata: {
            adjustmentId: result.adjustmentId,
            available: result.available,
            reserved: result.reserved,
            physicalStock: result.physicalStock,
            referenceId: params.referenceId ?? null,
          },
        },
        prisma,
      );
      revalidateCataloguePaths(result.slug ? [result.slug] : []);
    }

    return {
      ok: true,
      idempotentReplay: result.idempotentReplay,
      adjustmentId: result.adjustmentId,
      available: result.available,
      reserved: result.reserved,
      physicalStock: result.physicalStock,
    };
  } catch (error) {
    if (error instanceof InventoryRuleError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function recordStockInward(
  actor: AuthenticatedAdmin,
  rawInput: StockInwardInput,
  prismaClient?: PrismaClient,
): Promise<StockMutationResult> {
  const parsed = stockInwardSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid stock inward input." };
  }
  const d = parsed.data;
  const note = [d.reason, d.note?.trim()].filter(Boolean).join(" — ");

  return executeLockedStockMutation({
    actor,
    productId: d.productId,
    idempotencyKey: d.idempotencyKey,
    reason: "RESTOCK",
    referenceId: d.referenceId,
    note,
    auditAction: "INVENTORY_INWARD",
    computeNextAvailable: (cur) => cur.available + d.quantity,
    prismaClient,
  });
}

export async function recordStockOutward(
  actor: AuthenticatedAdmin,
  rawInput: StockOutwardInput,
  prismaClient?: PrismaClient,
): Promise<StockMutationResult> {
  const parsed = stockOutwardSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid stock outward input." };
  }
  const d = parsed.data;
  const note = [d.reason, d.note?.trim()].filter(Boolean).join(" — ");

  return executeLockedStockMutation({
    actor,
    productId: d.productId,
    idempotencyKey: d.idempotencyKey,
    reason: "OUTWARD",
    referenceId: d.referenceId,
    note,
    auditAction: "INVENTORY_OUTWARD",
    computeNextAvailable: (cur) => {
      if (d.quantity > cur.available) {
        throw new InventoryRuleError(
          `Cannot issue ${d.quantity} unit(s): only ${cur.available} available (${cur.reserved} reserved for orders).`,
        );
      }
      return cur.available - d.quantity;
    },
    prismaClient,
  });
}

export async function recordStockAdjustment(
  actor: AuthenticatedAdmin,
  rawInput: StockAdjustmentInput,
  prismaClient?: PrismaClient,
): Promise<StockMutationResult> {
  const parsed = stockAdjustmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid stock adjustment input." };
  }
  const d = parsed.data;
  const note = [d.reason, d.note?.trim()].filter(Boolean).join(" — ");

  return executeLockedStockMutation({
    actor,
    productId: d.productId,
    idempotencyKey: d.idempotencyKey,
    reason: "MANUAL_ADJUSTMENT",
    referenceId: d.referenceId,
    note,
    auditAction: "INVENTORY_ADJUSTMENT",
    computeNextAvailable: (cur) => {
      if (d.mode === "SET_PHYSICAL") {
        if (d.quantity < cur.reserved) {
          throw new InventoryRuleError(
            `Cannot set physical stock to ${d.quantity}: ${cur.reserved} unit(s) are currently reserved for orders.`,
          );
        }
        return d.quantity - cur.reserved;
      }
      if (d.mode === "DELTA_INCREASE") {
        return cur.available + d.quantity;
      }
      if (d.quantity > cur.available) {
        throw new InventoryRuleError(
          `Cannot decrease stock by ${d.quantity}: only ${cur.available} available (${cur.reserved} reserved).`,
        );
      }
      return cur.available - d.quantity;
    },
    prismaClient,
  });
}

export async function updateLowStockThreshold(
  actor: AuthenticatedAdmin,
  rawInput: LowStockThresholdInput,
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = lowStockThresholdSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid threshold." };
  }
  const prisma = prismaClient ?? getPrisma();
  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true, slug: true },
  });
  if (!product) {
    return { ok: false, error: "Product not found." };
  }

  await prisma.productStock.upsert({
    where: { productId: parsed.data.productId },
    create: {
      productId: parsed.data.productId,
      available: 0,
      reserved: 0,
      lowStockThreshold: parsed.data.threshold,
    },
    update: { lowStockThreshold: parsed.data.threshold },
  });

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "INVENTORY_THRESHOLD_UPDATE",
      targetType: "ProductStock",
      targetId: parsed.data.productId,
      success: true,
      metadata: { lowStockThreshold: parsed.data.threshold },
    },
    prisma,
  );

  revalidateCataloguePaths([product.slug]);
  return { ok: true };
}
