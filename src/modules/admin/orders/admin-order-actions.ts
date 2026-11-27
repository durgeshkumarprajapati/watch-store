"use server";

import { revalidatePath } from "next/cache";
import { revalidatePublicCatalogueCache } from "@/modules/catalogue/catalogue-cache";
import { requireAdminActionPermission } from "../admin-auth-service";
import {
  cancelAdminOrder,
  confirmCodPaymentCollected,
  dispatchAdminOrder,
  markOrderPacked,
  transitionAdminOrderStatus,
} from "./admin-order-transition-service";
import type {
  CancelOrderInput,
  ConfirmCodCollectionInput,
  DispatchOrderInput,
  PackOrderInput,
  TransitionOrderInput,
} from "./order-validation";

function revalidateOrderPaths(orderId: string) {
  try {
    revalidatePublicCatalogueCache();
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/inventory/reservations");
    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${orderId}`);
  } catch {
    // Outside Next.js request context.
  }
}

export async function transitionAdminOrderStatusAction(input: TransitionOrderInput) {
  const actor = await requireAdminActionPermission("orders.update");
  const res = await transitionAdminOrderStatus(actor, input);
  if (res.ok) revalidateOrderPaths(input.orderId);
  return res;
}

export async function markOrderPackedAction(input: PackOrderInput) {
  const actor = await requireAdminActionPermission("orders.update");
  const res = await markOrderPacked(actor, input);
  if (res.ok) revalidateOrderPaths(input.orderId);
  return res;
}

export async function dispatchAdminOrderAction(input: DispatchOrderInput) {
  const actor = await requireAdminActionPermission("orders.update");
  const res = await dispatchAdminOrder(actor, input);
  if (res.ok) revalidateOrderPaths(input.orderId);
  return res;
}

export async function confirmCodPaymentCollectedAction(input: ConfirmCodCollectionInput) {
  const actor = await requireAdminActionPermission("orders.update");
  const res = await confirmCodPaymentCollected(actor, input);
  if (res.ok) revalidateOrderPaths(input.orderId);
  return res;
}

export async function cancelAdminOrderAction(input: CancelOrderInput) {
  const actor = await requireAdminActionPermission("orders.cancel");
  const res = await cancelAdminOrder(actor, input);
  if (res.ok) revalidateOrderPaths(input.orderId);
  return res;
}
