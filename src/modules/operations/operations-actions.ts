"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { recordAdminAuditLog } from "@/modules/admin/admin-audit-service";
import {
  adminReconcilePaymentById,
  adminRetryMediaCleanupJob,
  executeScheduledMediaCleanup,
  executeScheduledNotificationProcess,
  executeScheduledPaymentReconcile,
  executeScheduledReservationCleanup,
  executeScheduledShippingSync,
} from "./operations-service";

export async function triggerOperationsJobAction(
  jobName:
    | "RESERVATION_CLEANUP"
    | "SHIPPING_SYNC"
    | "NOTIFICATION_PROCESS"
    | "MEDIA_CLEANUP"
    | "PAYMENT_RECONCILE",
) {
  const actor = await requireAdminPermission("operations.manage");
  let res;
  if (jobName === "RESERVATION_CLEANUP") res = await executeScheduledReservationCleanup();
  else if (jobName === "SHIPPING_SYNC") res = await executeScheduledShippingSync();
  else if (jobName === "NOTIFICATION_PROCESS") res = await executeScheduledNotificationProcess();
  else if (jobName === "MEDIA_CLEANUP") res = await executeScheduledMediaCleanup();
  else res = await executeScheduledPaymentReconcile();

  await recordAdminAuditLog({
    actorAdminId: actor.adminId,
    action: "OPERATIONS_JOB_TRIGGER",
    targetType: "SchedulerRun",
    targetId: res.runId,
    success: res.ok,
    metadata: { jobName, processedCount: res.processedCount, errorCount: res.errorCount },
  });

  revalidatePath("/admin/operations");
  return res;
}

export async function retryMediaCleanupJobAction(jobId: string) {
  const actor = await requireAdminPermission("operations.manage");
  const res = await adminRetryMediaCleanupJob(actor, jobId);
  revalidatePath("/admin/operations");
  return res;
}

export async function reconcilePaymentAction(paymentId: string) {
  const actor = await requireAdminPermission("operations.manage");
  const res = await adminReconcilePaymentById(actor, paymentId);
  revalidatePath("/admin/operations");
  return res;
}
