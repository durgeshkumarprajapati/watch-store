import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { brand } from "@/config/brand";
import { getServerEnv, hasDatabaseUrl } from "@/config/env";
import { formatINR } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { verifyOrderAccessToken } from "@/modules/payments/infrastructure/razorpay-signature";

export const metadata: Metadata = {
  title: "Order Confirmation",
  description: "View your WatchStore order and payment status.",
};

export const dynamic = "force-dynamic";

export default async function OrderConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; token?: string }>;
}) {
  const { order: orderNumber, token } = await searchParams;
  const env = getServerEnv();

  let orderRecord = null;
  if (orderNumber && token && hasDatabaseUrl() && env.RAZORPAY_KEY_SECRET) {
    const candidate = await getPrisma().order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        addressSnapshot: true,
      },
    });
    if (
      candidate &&
      verifyOrderAccessToken({
        token,
        orderNumber: candidate.orderNumber,
        guestEmail: candidate.guestEmail,
        secret: env.RAZORPAY_KEY_SECRET,
      })
    ) {
      orderRecord = candidate;
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface border-b border-outline">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-20 flex items-center justify-between gap-4">
          <Link href="/" className="font-headline text-headline-md text-on-surface">
            {brand.wordmark}
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 lg:px-6 py-12">
        {!orderRecord ? (
          <div className="bg-surface border border-outline rounded-md p-10 text-center flex flex-col items-center gap-4">
            <Icon name="lock" size={36} className="text-primary" />
            <h1 className="font-headline text-headline-lg text-on-surface">Order Confirmation Unavailable</h1>
            <p className="font-body text-body-md text-on-surface-variant max-w-md">
              We could not verify access to this order reference. Please return to the storefront or check your bag.
            </p>
            <Link
              href="/products"
              className="px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90"
            >
              Browse Catalogue
            </Link>
          </div>
        ) : (
          <div className="bg-surface border border-outline rounded-md p-6 sm:p-8 flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-outline pb-6">
              <div>
                <span className="font-label text-label-sm uppercase tracking-wider text-secondary dark:text-primary">
                  Order Reference: {orderRecord.orderNumber}
                </span>
                <h1 className="font-headline text-headline-lg text-on-surface mt-1">
                  {orderRecord.paymentStatus === "PAID"
                    ? "Payment Confirmed"
                    : orderRecord.paymentProvider === "COD"
                      ? "Order Confirmed (Cash on Delivery)"
                      : "Order Saved — Payment Pending"}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={orderRecord.status === "CONFIRMED" ? "success" : "secondary"}>
                  {orderRecord.status}
                </Badge>
                <Badge tone={orderRecord.paymentStatus === "PAID" ? "success" : "primary"}>
                  Payment: {orderRecord.paymentStatus}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {orderRecord.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 font-body text-body-md">
                  <div>
                    <p className="font-title text-title-md text-on-surface">{item.productNameSnapshot}</p>
                    <p className="font-mono text-mono-sm text-on-surface-variant">
                      SKU: {item.skuSnapshot} • Qty: {item.quantity}
                    </p>
                  </div>
                  <span className="font-mono text-mono-md text-on-surface tabular-nums">
                    {formatINR(item.lineTotalPaise)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-outline pt-4 flex items-center justify-between">
              <span className="font-title text-title-lg text-on-surface">Total Payable</span>
              <span className="font-headline text-headline-md text-on-surface tabular-nums">
                {formatINR(orderRecord.grandTotalPaise)}
              </span>
            </div>

            {orderRecord.addressSnapshot && (
              <div className="border-t border-outline pt-4 font-body text-body-md text-on-surface-variant">
                <p className="font-label text-label-sm uppercase tracking-wider text-on-surface mb-1">
                  Delivery Address
                </p>
                <p>{orderRecord.addressSnapshot.fullName}</p>
                <p>{orderRecord.addressSnapshot.addressLine1}</p>
                <p>
                  {orderRecord.addressSnapshot.city}, {orderRecord.addressSnapshot.state} —{" "}
                  <span className="font-mono">{orderRecord.addressSnapshot.pinCode}</span>
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {orderRecord.paymentStatus !== "PAID" && (
                <Link
                  href={`/checkout/confirmation?order=${encodeURIComponent(orderRecord.orderNumber)}&token=${encodeURIComponent(token ?? "")}`}
                  className="px-5 py-2.5 rounded-sm border border-outline font-label text-label-sm uppercase tracking-wider text-on-surface hover:border-primary"
                >
                  Refresh Payment Status
                </Link>
              )}
              <Link
                href="/products"
                className="px-6 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider hover:opacity-90"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
