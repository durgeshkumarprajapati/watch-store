"use server";

import { revalidatePath } from "next/cache";
import { revalidatePublicCatalogueCache } from "@/modules/catalogue/catalogue-cache";
import { requireAdminActionPermission } from "../admin-auth-service";
import {
  recordStockAdjustment,
  recordStockInward,
  recordStockOutward,
  updateLowStockThreshold,
} from "./inventory-mutation-service";
import type {
  LowStockThresholdInput,
  StockAdjustmentInput,
  StockInwardInput,
  StockOutwardInput,
} from "./inventory-validation";

function revalidateInventoryRoutes(productId: string) {
  try {
    revalidatePublicCatalogueCache();
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${productId}`);
    revalidatePath("/admin/inventory/movements");
    revalidatePath("/admin/inventory/reservations");
  } catch {
    // Outside Next.js request context.
  }
}

export async function stockInwardAction(input: StockInwardInput) {
  const actor = await requireAdminActionPermission("inventory.update");
  const res = await recordStockInward(actor, input);
  if (res.ok) revalidateInventoryRoutes(input.productId);
  return res;
}

export async function stockOutwardAction(input: StockOutwardInput) {
  const actor = await requireAdminActionPermission("inventory.update");
  const res = await recordStockOutward(actor, input);
  if (res.ok) revalidateInventoryRoutes(input.productId);
  return res;
}

export async function stockAdjustmentAction(input: StockAdjustmentInput) {
  const actor = await requireAdminActionPermission("inventory.update");
  const res = await recordStockAdjustment(actor, input);
  if (res.ok) revalidateInventoryRoutes(input.productId);
  return res;
}

export async function updateLowStockThresholdAction(input: LowStockThresholdInput) {
  const actor = await requireAdminActionPermission("inventory.update");
  const res = await updateLowStockThreshold(actor, input);
  if (res.ok) revalidateInventoryRoutes(input.productId);
  return res;
}
