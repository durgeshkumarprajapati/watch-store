import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { AccountShell } from "@/components/store/account/account-shell";
import { DownloadInvoiceButton } from "@/components/store/account/download-invoice-button";
import { getServerEnv } from "@/config/env";
import { formatINR } from "@/lib/format";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";
import { getCustomerOrderById } from "@/modules/customers/customer-service";
import { createOrderAccessToken } from "@/modules/payments/infrastructure/razorpay-signature";
import { getCustomerOrderShipments } from "@/modules/shipping/application/shipping-query-service";

export const metadata: Metadata = {
  title: "Order Details",
  description: "View your WatchStore order details and payment status.",
};

export const dynamic = "force-dynamic";

export default async function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const customer = await requireAuthenticatedCustomerPage();
  const { orderId } = await params;
  const order = await getCustomerOrderById(customer.id, orderId);
  if (!order) notFound();
  const shipments = await getCustomerOrderShipments(order.id, customer.id);
  const latestShipment = shipments[0] ?? null;

  const env = getServerEnv();
  const canRetryPayment =
    order.paymentProvider === "RAZORPAY" &&
    order.paymentStatus !== "PAID" &&
    Boolean(env.RAZORPAY_KEY_SECRET);
  const accessToken =
    canRetryPayment && env.RAZORPAY_KEY_SECRET
      ? createOrderAccessToken({
          orderNumber: order.orderNumber,
          guestEmail: order.guestEmail,
          secret: env.RAZORPAY_KEY_SECRET,
        })
      : null;

  return (
    <AccountShell customer={customer} activeTab="orders">
      <section className="bg-surface border border-outline rounded-md p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline pb-5">
          <div>
            <Link
              href="/account/orders"
              className="inline-flex items-center gap-1.5 font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-primary mb-2"
            >
              <Icon name="arrow_back" size={16} />
              <span>Back to Orders</span>
            </Link>
            <h2 className="font-headline text-headline-lg text-on-surface">
              Order {order.orderNumber}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={order.status === "CONFIRMED" || order.status === "DELIVERED" ? "success" : "secondary"}>
              {order.status}
            </Badge>
            <Badge tone={order.paymentStatus === "PAID" ? "success" : "primary"}>
              Payment: {order.paymentStatus}
            </Badge>
            {order.status === "DELIVERED" ? (
              <DownloadInvoiceButton orderId={order.id} orderNumber={order.orderNumber} />
            ) : null}
          </div>
        </div>

        {(latestShipment || order.carrierName || order.trackingNumber || order.manualRefundRequired) && (
          <div className="p-4 rounded border border-outline bg-surface-container flex flex-col gap-2 font-body text-body-md">
            {(latestShipment || order.carrierName || order.trackingNumber) ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-label text-label-sm uppercase tracking-wider text-on-surface">
                    Shipment Tracking
                  </p>
                  {latestShipment ? (
                    <span className="font-mono text-mono-sm text-on-surface-variant">
                      {latestShipment.status}
                    </span>
                  ) : null}
                </div>
                <p className="text-on-surface-variant">
                  {latestShipment?.courierName ?? order.carrierName ?? "Courier pending"} •{" "}
                  <span className="font-mono text-on-surface">
                    {latestShipment?.awbCode ?? order.trackingNumber ?? "Tracking pending"}
                  </span>
                </p>
                {(latestShipment?.trackingUrl ?? order.trackingUrl) ? (
                  <a
                    href={(latestShipment?.trackingUrl ?? order.trackingUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline w-fit"
                  >
                    Track Shipment
                  </a>
                ) : null}
                {latestShipment && latestShipment.statusHistory.length > 0 ? (
                  <ul className="pt-2 border-t border-outline flex flex-col gap-1 text-body-md">
                    {latestShipment.statusHistory.slice(0, 5).map((ev) => (
                      <li key={ev.id} className="flex justify-between gap-2 text-on-surface-variant">
                        <span>
                          <strong className="font-mono text-mono-sm text-on-surface">{ev.toStatus}</strong>
                          {ev.location ? ` • ${ev.location}` : ""}
                        </span>
                        <span className="font-mono text-mono-sm">
                          {ev.eventAt.toLocaleDateString("en-IN")}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
            {order.manualRefundRequired ? (
              <p className="text-on-surface-variant">
                Refund Status: Awaiting manual refund processing by concierge.
              </p>
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 py-2 border-b border-outline last:border-0">
              <div>
                <p className="font-title text-title-md text-on-surface">{item.productNameSnapshot}</p>
                <p className="font-mono text-mono-sm text-on-surface-variant">
                  SKU: {item.skuSnapshot} • Qty: {item.quantity} • Unit: {formatINR(item.unitPricePaise)}
                </p>
              </div>
              <span className="font-mono text-mono-md text-on-surface tabular-nums">
                {formatINR(item.lineTotalPaise)}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-outline">
          {order.addressSnapshot && (
            <div className="font-body text-body-md text-on-surface-variant">
              <h3 className="font-label text-label-sm uppercase tracking-wider text-on-surface mb-1">
                Delivery Address Snapshot
              </h3>
              <p>{order.addressSnapshot.fullName}</p>
              <p>{order.addressSnapshot.addressLine1}</p>
              <p>
                {order.addressSnapshot.city}, {order.addressSnapshot.state} —{" "}
                <span className="font-mono">{order.addressSnapshot.pinCode}</span>
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5 font-body text-body-md">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="font-mono tabular-nums">{formatINR(order.subtotalPaise)}</span>
            </div>
            {order.promoDiscountPaise > 0 && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Promo ({order.promoCode})</span>
                <span className="font-mono text-success tabular-nums">-{formatINR(order.promoDiscountPaise)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Included GST</span>
              <span className="font-mono tabular-nums">{formatINR(order.includedGstPaise)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-outline font-title text-title-md">
              <span>Total</span>
              <span className="font-mono tabular-nums">{formatINR(order.grandTotalPaise)}</span>
            </div>
          </div>
        </div>

        {accessToken && (
          <div className="pt-2">
            <Link
              href={`/checkout/confirmation?order=${encodeURIComponent(order.orderNumber)}&token=${encodeURIComponent(accessToken)}`}
              className="inline-flex px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90"
            >
              View Payment Status
            </Link>
          </div>
        )}
      </section>
    </AccountShell>
  );
}
