import "server-only";
import type { OrderStatus, PaymentProvider, PaymentStatus, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { brand } from "@/config/brand";
import { getPrisma } from "@/lib/prisma";
import { resolveSellerInvoiceConfig, type SellerInvoiceConfig } from "./seller-config";

export type TaxMode = "CGST_SGST" | "IGST" | "GST_INCLUSIVE_UNREGISTERED";

export const invoiceItemSnapshotSchema = z.object({
  productName: z.string(),
  sku: z.string(),
  brandName: z.string(),
  dialAndStrap: z.string(),
  quantity: z.number().int().positive(),
  unitMrpPaise: z.number().int().nonnegative(),
  unitPricePaise: z.number().int().nonnegative(),
  unitDiscountPaise: z.number().int().nonnegative(),
  taxableValuePaise: z.number().int().nonnegative(),
  gstRateBps: z.number().int().nonnegative(),
  cgstPaise: z.number().int().nonnegative(),
  sgstPaise: z.number().int().nonnegative(),
  igstPaise: z.number().int().nonnegative(),
  lineGstPaise: z.number().int().nonnegative(),
  lineTotalPaise: z.number().int().nonnegative(),
});

export const invoiceSnapshotSchema = z.object({
  invoiceNumber: z.string().min(1),
  issuedAtIso: z.string().min(1),
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  orderDateIso: z.string().min(1),
  deliveredAtIso: z.string().nullable(),
  orderStatus: z.string(),
  paymentMethod: z.enum(["COD", "RAZORPAY"]),
  paymentStatus: z.string(),
  paymentReference: z.string().nullable(),
  taxMode: z.enum(["CGST_SGST", "IGST", "GST_INCLUSIVE_UNREGISTERED"]),
  seller: z.object({
    legalName: z.string(),
    address: z.string(),
    state: z.string(),
    gstin: z.string().nullable(),
    email: z.string(),
    phone: z.string(),
  }),
  customer: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    gstin: z.string().nullable(),
    billingAddressLines: z.array(z.string()),
    shippingAddressLines: z.array(z.string()),
  }),
  items: z.array(invoiceItemSnapshotSchema),
  totals: z.object({
    mrpTotalPaise: z.number().int().nonnegative(),
    productSavingsPaise: z.number().int().nonnegative(),
    promoCode: z.string().nullable(),
    promoDiscountPaise: z.number().int().nonnegative(),
    subtotalPaise: z.number().int().nonnegative(),
    shippingPaise: z.number().int().nonnegative(),
    taxableAmountPaise: z.number().int().nonnegative(),
    cgstTotalPaise: z.number().int().nonnegative(),
    sgstTotalPaise: z.number().int().nonnegative(),
    igstTotalPaise: z.number().int().nonnegative(),
    includedGstPaise: z.number().int().nonnegative(),
    grandTotalPaise: z.number().int().nonnegative(),
    amountPaidPaise: z.number().int().nonnegative(),
    outstandingPaise: z.number().int().nonnegative(),
  }),
});

export type InvoiceSnapshot = z.infer<typeof invoiceSnapshotSchema>;

export type InvoiceServiceResult =
  | { ok: true; invoiceId: string; invoiceNumber: string; issuedAt: Date; snapshot: InvoiceSnapshot; created: boolean }
  | { ok: false; status: number; error: string };

export function isOrderEligibleForInvoice(status: OrderStatus): boolean {
  return status === "DELIVERED";
}

function determineTaxMode(seller: SellerInvoiceConfig, customerState: string): TaxMode {
  if (!seller.gstin) return "GST_INCLUSIVE_UNREGISTERED";
  if (seller.state && customerState && seller.state.trim().toLowerCase() === customerState.trim().toLowerCase()) {
    return "CGST_SGST";
  }
  return "IGST";
}

function formatAddressLines(addr: {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pinCode: string;
  country: string;
} | null): string[] {
  if (!addr) return [];
  return [
    addr.fullName,
    addr.addressLine1,
    addr.addressLine2.trim() || null,
    `${addr.city}, ${addr.state} ${addr.pinCode}`,
    addr.country,
  ].filter((x): x is string => Boolean(x));
}

export async function generateOrGetOrderInvoice(
  params: {
    orderId: string;
    sellerOverride?: Partial<SellerInvoiceConfig>;
    customerGstin?: string | null;
  },
  prismaClient?: PrismaClient,
): Promise<InvoiceServiceResult> {
  const prisma = prismaClient ?? getPrisma();

  const existingQuick = await prisma.orderInvoice.findUnique({
    where: { orderId: params.orderId },
  });
  if (existingQuick) {
    const parsed = invoiceSnapshotSchema.parse(existingQuick.snapshot);
    return {
      ok: true,
      invoiceId: existingQuick.id,
      invoiceNumber: existingQuick.invoiceNumber,
      issuedAt: existingQuick.issuedAt,
      snapshot: parsed,
      created: false,
    };
  }

  // Validate seller config before entering DB transaction.
  const seller = resolveSellerInvoiceConfig(params.sellerOverride);

  return prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
      SELECT "id", "status"
      FROM "Order"
      WHERE "id" = ${params.orderId}
      FOR UPDATE
    `;
    const locked = lockedRows[0];
    if (!locked) {
      return { ok: false, status: 404, error: "Order not found." };
    }

    if (!isOrderEligibleForInvoice(locked.status)) {
      return {
        ok: false,
        status: 409,
        error: "Invoice is available only after the order is delivered.",
      };
    }

    const existingInTx = await tx.orderInvoice.findUnique({
      where: { orderId: params.orderId },
    });
    if (existingInTx) {
      const parsed = invoiceSnapshotSchema.parse(existingInTx.snapshot);
      return {
        ok: true,
        invoiceId: existingInTx.id,
        invoiceNumber: existingInTx.invoiceNumber,
        issuedAt: existingInTx.issuedAt,
        snapshot: parsed,
        created: false,
      };
    }

    const order = await tx.order.findUniqueOrThrow({
      where: { id: params.orderId },
      include: {
        items: true,
        addressSnapshot: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    const issuedAt = new Date();
    const yearMonth = `${issuedAt.getUTCFullYear()}${String(issuedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const seqRows = await tx.$queryRaw<{ lastValue: number }[]>`
      INSERT INTO "InvoiceSequence" ("yearMonth", "lastValue")
      VALUES (${yearMonth}, 1)
      ON CONFLICT ("yearMonth") DO UPDATE SET "lastValue" = "InvoiceSequence"."lastValue" + 1
      RETURNING "lastValue"
    `;
    const seq = seqRows[0]?.lastValue ?? 1;
    const invoiceNumber = `INV-${brand.business.orderPrefix}-${yearMonth}-${String(seq).padStart(5, "0")}`;

    const customerState = order.addressSnapshot?.state ?? "";
    const taxMode = determineTaxMode(seller, customerState);

    let cgstTotalPaise = 0;
    let sgstTotalPaise = 0;
    let igstTotalPaise = 0;

    const items = order.items.map((item) => {
      const taxableValuePaise = Math.max(0, item.lineTotalPaise - item.lineGstPaise);
      let cgstPaise = 0;
      let sgstPaise = 0;
      let igstPaise = 0;

      if (taxMode === "CGST_SGST") {
        cgstPaise = Math.floor(item.lineGstPaise / 2);
        sgstPaise = item.lineGstPaise - cgstPaise;
      } else if (taxMode === "IGST") {
        igstPaise = item.lineGstPaise;
      }

      cgstTotalPaise += cgstPaise;
      sgstTotalPaise += sgstPaise;
      igstTotalPaise += igstPaise;

      return {
        productName: item.productNameSnapshot,
        sku: item.skuSnapshot,
        brandName: item.brandNameSnapshot,
        dialAndStrap: item.dialAndStrapSnapshot,
        quantity: item.quantity,
        unitMrpPaise: item.unitMrpPaise,
        unitPricePaise: item.unitPricePaise,
        unitDiscountPaise: item.unitDiscountPaise,
        taxableValuePaise,
        gstRateBps: item.gstRateBps,
        cgstPaise,
        sgstPaise,
        igstPaise,
        lineGstPaise: item.lineGstPaise,
        lineTotalPaise: item.lineTotalPaise,
      };
    });

    const paidPayments = order.payments.filter((p) => p.status === "PAID");
    const latestPaid = paidPayments[0] ?? order.payments[0] ?? null;
    const paymentReference = latestPaid?.providerPaymentId ?? latestPaid?.providerOrderId ?? null;
    const amountPaidPaise =
      order.paymentStatus === "PAID"
        ? paidPayments.reduce((sum, p) => sum + p.amountPaise, 0) || order.grandTotalPaise
        : 0;
    const outstandingPaise = Math.max(0, order.grandTotalPaise - amountPaidPaise);
    const taxableAmountPaise = Math.max(0, order.subtotalPaise - order.includedGstPaise);
    const addressLines = formatAddressLines(order.addressSnapshot);

    const snapshot: InvoiceSnapshot = {
      invoiceNumber,
      issuedAtIso: issuedAt.toISOString(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderDateIso: order.createdAt.toISOString(),
      deliveredAtIso: order.deliveredAt ? order.deliveredAt.toISOString() : null,
      orderStatus: order.status,
      paymentMethod: order.paymentProvider as PaymentProvider,
      paymentStatus: order.paymentStatus as PaymentStatus,
      paymentReference,
      taxMode,
      seller,
      customer: {
        name: order.addressSnapshot?.fullName ?? order.guestName,
        email: order.addressSnapshot?.email ?? order.guestEmail,
        phone: order.addressSnapshot?.phone ?? order.guestPhone,
        gstin: params.customerGstin?.trim() || null,
        billingAddressLines: addressLines,
        shippingAddressLines: addressLines,
      },
      items,
      totals: {
        mrpTotalPaise: order.mrpTotalPaise,
        productSavingsPaise: order.productSavingsPaise,
        promoCode: order.promoCode,
        promoDiscountPaise: order.promoDiscountPaise,
        subtotalPaise: order.subtotalPaise,
        shippingPaise: order.shippingPaise,
        taxableAmountPaise,
        cgstTotalPaise,
        sgstTotalPaise,
        igstTotalPaise,
        includedGstPaise: order.includedGstPaise,
        grandTotalPaise: order.grandTotalPaise,
        amountPaidPaise,
        outstandingPaise,
      },
    };

    const created = await tx.orderInvoice.create({
      data: {
        orderId: order.id,
        invoiceNumber,
        issuedAt,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      invoiceId: created.id,
      invoiceNumber: created.invoiceNumber,
      issuedAt: created.issuedAt,
      snapshot,
      created: true,
    };
  });
}
