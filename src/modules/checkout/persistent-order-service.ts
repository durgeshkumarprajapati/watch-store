import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type OrderStatus, type PaymentProvider, type PaymentStatus } from "@prisma/client";
import { brand } from "@/config/brand";
import { getPrisma } from "@/lib/prisma";
import { COD_MAX_ORDER_PAISE, computeCartSummary } from "@/modules/cart/cart-service";
import type { CartLine } from "@/modules/cart/cart-store";
import type { Product } from "@/modules/catalogue/types";
import { InsufficientStockError, reserveStockInTx } from "@/modules/inventory/reservation-service";
import type { ValidatedCheckoutInput } from "@/validations/checkout";
import { canTransitionOrderStatus } from "./status-transitions";

export interface PersistedOrderView {
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: "razorpay" | "cod";
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
    country: string;
  };
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

export type CreatePersistentOrderResult =
  | { ok: true; order: PersistedOrderView; idempotentReplay: boolean }
  | { ok: false; error: string };

function generateOrderNumber(): string {
  const ts = Date.now().toString().slice(-6);
  const rand = randomBytes(2).toString("hex").toUpperCase();
  return `${brand.business.orderPrefix}-${ts}${rand}`;
}

function mapPrismaProduct(row: {
  id: string;
  slug: string;
  sku: string;
  name: string;
  brand: { id: string; name: string };
  categories: { categoryId: string }[];
  gender: Product["gender"];
  watchType: Product["watchType"];
  strapMaterial: Product["strapMaterial"];
  dialAndStrap: string;
  description: string;
  specMovement: string;
  specCaseDimensions: string;
  specCrystal: string;
  specWaterResistance: string;
  specHsn: string;
  mrpPaise: number;
  pricePaise: number;
  gstRateBps: number;
  badge: Product["badge"];
  isBestSeller: boolean;
  images: { url: string }[];
  stock: { available: number; reserved: number } | null;
  warrantyYears: number | null;
  createdAt: Date;
}): Product {
  return {
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    brand: { id: row.brand.id, name: row.brand.name },
    categoryIds: row.categories.map((c) => c.categoryId),
    gender: row.gender,
    watchType: row.watchType,
    strapMaterial: row.strapMaterial,
    dialAndStrap: row.dialAndStrap,
    description: row.description,
    specs: {
      movement: row.specMovement,
      caseDimensions: row.specCaseDimensions,
      crystal: row.specCrystal,
      waterResistance: row.specWaterResistance,
      hsn: row.specHsn,
    },
    mrpPaise: row.mrpPaise,
    pricePaise: row.pricePaise,
    gstRateBps: row.gstRateBps,
    badge: row.badge,
    isBestSeller: row.isBestSeller,
    images: row.images.map((i) => i.url),
    stock: {
      available: row.stock?.available ?? 0,
      reserved: row.stock?.reserved ?? 0,
    },
    warrantyYears: row.warrantyYears,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPersistedOrder(order: {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentProvider: PaymentProvider;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  subtotalPaise: number;
  promoCode: string | null;
  promoDiscountPaise: number;
  shippingPaise: number;
  includedGstPaise: number;
  grandTotalPaise: number;
  createdAt: Date;
  addressSnapshot: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pinCode: string;
    country: string;
  } | null;
}): PersistedOrderView {
  return {
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentProvider === "RAZORPAY" ? "razorpay" : "cod",
    customer: {
      fullName: order.guestName,
      email: order.guestEmail,
      phone: order.guestPhone,
    },
    shippingAddress: {
      addressLine1: order.addressSnapshot?.addressLine1 ?? "",
      addressLine2: order.addressSnapshot?.addressLine2 ?? "",
      city: order.addressSnapshot?.city ?? "",
      state: order.addressSnapshot?.state ?? "",
      pinCode: order.addressSnapshot?.pinCode ?? "",
      country: order.addressSnapshot?.country ?? "India",
    },
    totals: {
      subtotalPaise: order.subtotalPaise,
      promoCode: order.promoCode,
      promoDiscountPaise: order.promoDiscountPaise,
      shippingPaise: order.shippingPaise,
      includedGstPaise: order.includedGstPaise,
      grandTotalPaise: order.grandTotalPaise,
    },
    createdAtIso: order.createdAt.toISOString(),
  };
}

export async function createPersistentOrder(
  input: ValidatedCheckoutInput,
  cartLines: CartLine[],
  promoCode: string | null,
  authenticatedCustomerId?: string | null,
): Promise<CreatePersistentOrderResult> {
  if (cartLines.length === 0) {
    return { ok: false, error: "Your shopping bag is empty." };
  }

  const prisma = getPrisma();

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // 1. Idempotency check inside transaction
      const existing = await tx.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { addressSnapshot: true },
      });
      if (existing) {
        if (existing.guestEmail.toLowerCase() !== input.email.toLowerCase()) {
          throw new Error("IDEMPOTENCY_OWNER_MISMATCH");
        }
        return { order: mapPersistedOrder(existing), idempotentReplay: true };
      }

      // 2. Load authoritative products from PostgreSQL
      const productIds = Array.from(new Set(cartLines.map((l) => l.productId)));
      const dbProducts = await tx.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        include: {
          brand: true,
          categories: { select: { categoryId: true } },
          images: { orderBy: { sortOrder: "asc" }, select: { url: true } },
          stock: true,
        },
      });

      const mappedProducts = dbProducts.map(mapPrismaProduct);
      const summary = computeCartSummary(cartLines, mappedProducts, promoCode);

      if (summary.items.length === 0) {
        throw new Error("EMPTY_CART");
      }
      if (!summary.canCheckout) {
        throw new Error(`STOCK_ISSUE:${summary.issues[0]?.message ?? "Some items are unavailable."}`);
      }
      if (input.paymentMethod === "cod" && summary.grandTotalPaise > COD_MAX_ORDER_PAISE) {
        throw new Error("COD_LIMIT_EXCEEDED");
      }

      // 3. Associate with authenticated customer if logged in, otherwise upsert guest customer
      const customer = authenticatedCustomerId
        ? await tx.customer.findUnique({ where: { id: authenticatedCustomerId } })
        : await tx.customer.upsert({
            where: { email: input.email },
            create: {
              email: input.email,
              fullName: input.fullName,
              phone: input.phone,
            },
            update: {
              fullName: input.fullName,
              phone: input.phone,
            },
          });

      if (!customer) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      const provider: PaymentProvider = input.paymentMethod === "razorpay" ? "RAZORPAY" : "COD";
      const paymentStatus: PaymentStatus =
        input.paymentMethod === "razorpay" ? "REQUIRES_GATEWAY" : "PENDING";

      // 4. Create Order + OrderItems + AddressSnapshot + StatusHistory + Payment
      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          idempotencyKey: input.idempotencyKey,
          customerId: customer.id,
          guestEmail: input.email,
          guestName: input.fullName,
          guestPhone: input.phone,
          status: "PENDING",
          paymentStatus,
          paymentProvider: provider,
          shippingMethod: input.shippingMethod,
          promoCode: summary.promoCode,
          subtotalPaise: summary.subtotalPaise,
          mrpTotalPaise: summary.mrpTotalPaise,
          productSavingsPaise: summary.productSavingsPaise,
          promoDiscountPaise: summary.promoDiscountPaise,
          shippingPaise: summary.shippingPaise,
          includedGstPaise: summary.includedGstPaise,
          grandTotalPaise: summary.grandTotalPaise,
          items: {
            create: summary.items.map((item) => ({
              productId: item.productId,
              skuSnapshot: item.sku,
              productNameSnapshot: item.name,
              brandNameSnapshot: item.brandName,
              dialAndStrapSnapshot: item.dialAndStrap,
              unitMrpPaise: item.unitMrpPaise,
              unitPricePaise: item.unitPricePaise,
              unitDiscountPaise: Math.max(0, item.unitMrpPaise - item.unitPricePaise),
              gstRateBps: item.gstRateBps,
              quantity: item.quantity,
              lineTotalPaise: item.lineTotalPaise,
              lineGstPaise: item.lineGstPaise,
            })),
          },
          addressSnapshot: {
            create: {
              fullName: input.fullName,
              email: input.email,
              phone: input.phone,
              addressLine1: input.addressLine1,
              addressLine2: input.addressLine2,
              city: input.city,
              state: input.state,
              pinCode: input.pinCode,
              country: input.country,
            },
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: "PENDING",
              note: `Order created (${provider})`,
            },
          },
          payments: {
            create: {
              provider,
              status: paymentStatus,
              amountPaise: summary.grandTotalPaise,
              currency: "INR",
            },
          },
        },
        include: {
          items: true,
          addressSnapshot: true,
        },
      });

      // 5. Atomic inventory reservation for every order line
      for (const orderItem of created.items) {
        await reserveStockInTx(tx, {
          orderId: created.id,
          orderItemId: orderItem.id,
          productId: orderItem.productId,
          quantity: orderItem.quantity,
        });
      }

      return { order: mapPersistedOrder(created), idempotentReplay: false };
    });

    return { ok: true, ...outcome };
  } catch (err) {
    // Concurrent duplicate request hit unique idempotencyKey constraint
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { addressSnapshot: true },
      });
      if (existing && existing.guestEmail.toLowerCase() === input.email.toLowerCase()) {
        return { ok: true, order: mapPersistedOrder(existing), idempotentReplay: true };
      }
      return { ok: false, error: "This checkout request could not be processed." };
    }

    if (err instanceof InsufficientStockError) {
      return { ok: false, error: "One or more timepieces no longer have sufficient stock." };
    }

    if (err instanceof Error) {
      if (err.message === "IDEMPOTENCY_OWNER_MISMATCH") {
        return { ok: false, error: "Invalid checkout session. Please refresh and try again." };
      }
      if (err.message === "EMPTY_CART") {
        return { ok: false, error: "Your shopping bag is empty." };
      }
      if (err.message.startsWith("STOCK_ISSUE:")) {
        return { ok: false, error: err.message.slice("STOCK_ISSUE:".length) };
      }
      if (err.message === "COD_LIMIT_EXCEEDED") {
        return { ok: false, error: "Cash on Delivery is unavailable for orders exceeding ₹50,000." };
      }
    }

    console.error("Order persistence failed:", err instanceof Error ? err.message : "Unknown error");
    return { ok: false, error: "Unable to place your order right now. Your bag has been preserved." };
  }
}

export async function transitionOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!order) return { ok: false, error: "Order not found." };
    if (!canTransitionOrderStatus(order.status, toStatus)) {
      return { ok: false, error: `Invalid order status transition from ${order.status} to ${toStatus}.` };
    }
    await tx.order.update({ where: { id: orderId }, data: { status: toStatus } });
    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: order.status, toStatus, note },
    });
    return { ok: true };
  });
}
