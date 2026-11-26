"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/modules/admin/admin-auth-service";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";
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
