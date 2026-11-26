"use server";

import { revalidatePath } from "next/cache";
import {
  requireAdminActionPermission,
  requireAuthenticatedAdmin,
} from "@/modules/admin/admin-auth-service";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";
import {
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
} from "./inbox-service";
import { updateCustomerNotificationPreferences } from "./notification-query-service";
import { retryAdminNotification } from "./notification-worker-service";

export async function retryAdminNotificationAction(notificationId: string) {
  const actor = await requireAdminActionPermission("notifications.retry");
  const res = await retryAdminNotification(actor, notificationId);
  if (res.ok) {
    try {
      revalidatePath("/admin/notifications");
      revalidatePath(`/admin/notifications/${notificationId}`);
    } catch {
      // Outside Next.js request context.
    }
  }
  return res;
}

export async function updateCustomerNotificationPreferencesAction(input: {
  shippingUpdatesEnabled: boolean;
}) {
  const customer = await requireAuthenticatedCustomerPage();
  const res = await updateCustomerNotificationPreferences(customer.id, input);
  if (res.ok) {
    try {
      revalidatePath("/account/notifications");
    } catch {
      // Outside Next.js request context.
    }
  }
  return res;
}

export async function markCustomerInboxNotificationReadAction(notificationId: string) {
  const customer = await requireAuthenticatedCustomerPage();
  const updated = await markInboxNotificationRead(
    { type: "customer", customerId: customer.id },
    notificationId,
  );
  try {
    revalidatePath("/account/notifications");
  } catch {
    // Outside Next.js request context.
  }
  return { ok: true as const, updated };
}

export async function markAllCustomerInboxNotificationsReadAction() {
  const customer = await requireAuthenticatedCustomerPage();
  const updated = await markAllInboxNotificationsRead({
    type: "customer",
    customerId: customer.id,
  });
  try {
    revalidatePath("/account/notifications");
  } catch {
    // Outside Next.js request context.
  }
  return { ok: true as const, updated };
}

export async function markAdminInboxNotificationReadAction(notificationId: string) {
  const admin = await requireAuthenticatedAdmin();
  const updated = await markInboxNotificationRead(
    { type: "admin", adminUserId: admin.adminId },
    notificationId,
  );
  try {
    revalidatePath("/admin/inbox");
  } catch {
    // Outside Next.js request context.
  }
  return { ok: true as const, updated };
}

export async function markAllAdminInboxNotificationsReadAction() {
  const admin = await requireAuthenticatedAdmin();
  const updated = await markAllInboxNotificationsRead({
    type: "admin",
    adminUserId: admin.adminId,
  });
  try {
    revalidatePath("/admin/inbox");
  } catch {
    // Outside Next.js request context.
  }
  return { ok: true as const, updated };
}
