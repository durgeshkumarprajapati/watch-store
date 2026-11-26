"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerEnv, hasDatabaseUrl } from "@/config/env";
import { seedDataAllowed } from "@/config/data-source";
import { readJsonCookie, writeJsonCookie } from "@/lib/cookie-list";
import { getCartSummary } from "@/modules/cart/cart-service";
import {
  clearCartLines,
  getCartLines,
  getPromoCode,
  savePromoCode,
} from "@/modules/cart/cart-store";
import { getAuthenticatedCustomer } from "@/modules/auth/session-service";
import { createOrderAccessToken } from "@/modules/payments/infrastructure/razorpay-signature";
import { checkoutSchema, type CheckoutInput } from "@/validations/checkout";
import { prepareOrderSnapshot, type OrderSnapshot } from "./order-service";
import { createPersistentOrder, type PersistedOrderView } from "./persistent-order-service";

const idempotencyCookieSchema = z.array(z.string().min(8).max(64)).max(10);

export type SubmitCheckoutResult =
  | {
      ok: true;
      persisted: boolean;
      orderNumber?: string;
      orderAccessToken?: string;
      snapshot: Omit<OrderSnapshot, "idempotencyKey"> | PersistedOrderView;
      notice: string;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      duplicate?: boolean;
    };

export async function submitCheckoutAction(raw: CheckoutInput): Promise<SubmitCheckoutResult> {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check your checkout details.",
      fieldErrors,
    };
  }

  // Persistent PostgreSQL path
  if (hasDatabaseUrl() && process.env.CATALOGUE_SOURCE !== "seed") {
    const [cartLines, promoCode, authCustomer] = await Promise.all([
      getCartLines(),
      getPromoCode(),
      getAuthenticatedCustomer(),
    ]);
    const persisted = await createPersistentOrder(
      parsed.data,
      cartLines,
      promoCode,
      authCustomer?.id ?? null,
    );
    if (!persisted.ok) {
      return { ok: false, error: persisted.error };
    }

    // Clear cart ONLY after the PostgreSQL transaction succeeded.
    await clearCartLines();
    await savePromoCode(null);
    revalidatePath("/", "layout");
    revalidatePath("/cart");
    revalidatePath("/checkout");

    const env = getServerEnv();
    const orderAccessToken = env.RAZORPAY_KEY_SECRET
      ? createOrderAccessToken({
          orderNumber: persisted.order.orderNumber,
          guestEmail: persisted.order.customer.email,
          secret: env.RAZORPAY_KEY_SECRET,
        })
      : undefined;

    const notice =
      persisted.order.paymentMethod === "razorpay"
        ? orderAccessToken
          ? `Order ${persisted.order.orderNumber} created. Opening Razorpay Checkout…`
          : `Order ${persisted.order.orderNumber} created and inventory reserved. Configure Razorpay credentials to complete online payment.`
        : `Order ${persisted.order.orderNumber} confirmed with Cash on Delivery and inventory reserved.`;

    return {
      ok: true,
      persisted: true,
      orderNumber: persisted.order.orderNumber,
      orderAccessToken,
      snapshot: persisted.order,
      notice,
    };
  }

  if (!seedDataAllowed()) {
    return {
      ok: false,
      error: "Order persistence is not configured. Please try again later.",
    };
  }

  // Fallback for seed-only dev / unit tests without PostgreSQL
  const [cart, recentKeys] = await Promise.all([
    getCartSummary(),
    readJsonCookie("checkout_keys", idempotencyCookieSchema, []),
  ]);

  const result = prepareOrderSnapshot(parsed.data, cart, recentKeys);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      duplicate: result.duplicate,
    };
  }

  const nextKeys = [parsed.data.idempotencyKey, ...recentKeys].slice(0, 10);
  await writeJsonCookie("checkout_keys", nextKeys);

  const { idempotencyKey: _omit, ...publicSnapshot } = result.snapshot;
  void _omit;

  return {
    ok: true,
    persisted: false,
    snapshot: publicSnapshot,
    notice:
      publicSnapshot.paymentMethod === "razorpay"
        ? "Order verified server-side (seed preview). Online payment gateway (Razorpay) integration is scheduled for the next phase — no charge has been made."
        : "Order verified server-side (seed preview). Configure DATABASE_URL to persist orders to PostgreSQL.",
  };
}
