import { COD_MAX_ORDER_PAISE, type CartSummary } from "@/modules/cart/cart-service";
import type { ValidatedCheckoutInput } from "@/validations/checkout";

export type PaymentStatus = "pending" | "requires_gateway";
export type OrderLifecycleStatus = "awaiting_persistence";

export interface OrderLineSnapshot {
  productId: string;
  sku: string;
  name: string;
  unitPricePaise: number;
  gstRateBps: number;
  quantity: number;
  lineTotalPaise: number;
  lineGstPaise: number;
}

export interface OrderSnapshot {
  idempotencyKey: string;
  customer: {
    fullName: string;
    email: string;
    phone: string;
  };
  shippingAddress: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pinCode: string;
    country: "India";
  };
  shippingMethod: "standard";
  paymentMethod: "razorpay" | "cod";
  paymentStatus: PaymentStatus;
  orderStatus: OrderLifecycleStatus;
  lines: OrderLineSnapshot[];
  totals: {
    subtotalPaise: number;
    promoCode: string | null;
    promoDiscountPaise: number;
    shippingPaise: number;
    includedGstPaise: number;
    grandTotalPaise: number;
  };
  createdAtIso: string;
}

export type PrepareOrderResult =
  | { ok: true; snapshot: OrderSnapshot }
  | { ok: false; error: string; duplicate?: boolean };

/**
 * Prepares an immutable, server-priced order snapshot for checkout.
 * Phase 4/5 integration boundary: PostgreSQL persistence (Prisma transaction) and
 * live Razorpay order/signature verification will consume this snapshot without
 * trusting any client-submitted totals.
 */
export function prepareOrderSnapshot(
  input: ValidatedCheckoutInput,
  cart: CartSummary,
  recentIdempotencyKeys: string[],
): PrepareOrderResult {
  if (recentIdempotencyKeys.includes(input.idempotencyKey)) {
    return {
      ok: false,
      duplicate: true,
      error: "This checkout request was already submitted.",
    };
  }

  if (cart.items.length === 0) {
    return { ok: false, error: "Your shopping bag is empty." };
  }

  if (!cart.canCheckout) {
    const firstIssue = cart.issues[0]?.message ?? "Some items in your bag are unavailable.";
    return { ok: false, error: firstIssue };
  }

  if (input.paymentMethod === "cod" && cart.grandTotalPaise > COD_MAX_ORDER_PAISE) {
    return {
      ok: false,
      error: "Cash on Delivery is unavailable for orders exceeding ₹50,000.",
    };
  }

  const snapshot: OrderSnapshot = {
    idempotencyKey: input.idempotencyKey,
    customer: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
    },
    shippingAddress: {
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      pinCode: input.pinCode,
      country: input.country,
    },
    shippingMethod: input.shippingMethod,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentMethod === "razorpay" ? "requires_gateway" : "pending",
    orderStatus: "awaiting_persistence",
    lines: cart.items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      unitPricePaise: item.unitPricePaise,
      gstRateBps: item.gstRateBps,
      quantity: item.quantity,
      lineTotalPaise: item.lineTotalPaise,
      lineGstPaise: item.lineGstPaise,
    })),
    totals: {
      subtotalPaise: cart.subtotalPaise,
      promoCode: cart.promoCode,
      promoDiscountPaise: cart.promoDiscountPaise,
      shippingPaise: cart.shippingPaise,
      includedGstPaise: cart.includedGstPaise,
      grandTotalPaise: cart.grandTotalPaise,
    },
    createdAtIso: new Date().toISOString(),
  };

  return { ok: true, snapshot };
}
