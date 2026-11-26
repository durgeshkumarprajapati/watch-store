import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { OrderFulfilmentControls } from "@/components/admin/orders/order-fulfilment-controls";
import { ShipmentActionsPanel } from "@/components/admin/shipping/shipment-actions-panel";
import { formatINR } from "@/lib/format";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { getAdminOrderDetail } from "@/modules/admin/orders/admin-order-query-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";
import { isActiveShipmentStatus } from "@/modules/shipping/domain/shipment-state-machine";
import { isShiprocketConfigured } from "@/modules/shipping/infrastructure/shiprocket-client";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const admin = await requireAdminPermission("orders.read");
  const { orderId } = await params;
  const order = await getAdminOrderDetail(orderId);
  if (!order) notFound();

  const canUpdate = hasAdminPermission(admin.permissions, "orders.update");
  const canCancel = hasAdminPermission(admin.permissions, "orders.cancel");
  const activeShipment = order.shipments.find((s) => isActiveShipmentStatus(s.status)) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-primary mb-2"
          >
            <Icon name="arrow_back" size={16} /> Back to Orders
          </Link>
          <h1 className="font-headline text-headline-lg text-on-surface">
            Order {order.orderNumber}
          </h1>
          <p className="font-mono text-mono-sm text-on-surface-variant">
            Placed {order.createdAt.toLocaleString("en-IN")} • {order.status} /{" "}
            {order.fulfilmentStatus}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 rounded-sm bg-surface-container border border-outline font-mono text-mono-sm">
            {order.paymentProvider} • {order.paymentStatus}
          </span>
          {order.manualRefundRequired ? (
            <span className="px-3 py-1 rounded-sm bg-error/15 border border-error text-error font-label text-label-sm uppercase">
              Awaiting Manual Refund
            </span>
          ) : null}
        </div>
      </div>

      <OrderFulfilmentControls
        orderId={order.id}
        status={order.status}
        fulfilmentStatus={order.fulfilmentStatus}
        paymentProvider={order.paymentProvider}
        paymentStatus={order.paymentStatus}
        canUpdate={canUpdate}
        canCancel={canCancel}
      />

      <ShipmentActionsPanel
        orderId={order.id}
        shiprocketConfigured={isShiprocketConfigured()}
        activeShipment={
          activeShipment
            ? {
                id: activeShipment.id,
                provider: activeShipment.provider,
                isManual: activeShipment.isManual,
                status: activeShipment.status,
                shiprocketOrderId: activeShipment.shiprocketOrderId,
                awbCode: activeShipment.awbCode,
                labelUrl: activeShipment.labelUrl,
                pickupScheduledAt: activeShipment.pickupScheduledAt?.toISOString() ?? null,
                reconciliationRequired: activeShipment.reconciliationRequired,
              }
            : null
        }
        canManage={hasAdminPermission(admin.permissions, "shipments.manage")}
        canCancel={hasAdminPermission(admin.permissions, "shipments.cancel")}
        canRetry={hasAdminPermission(admin.permissions, "shipments.retry")}
      />

      {/* Order Items & Totals */}
      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-4">
        <h2 className="font-headline text-headline-md border-b border-outline pb-3">
          Immutable Order Items &amp; Totals
        </h2>
        <div className="divide-y divide-outline">
          {order.items.map((item) => {
            const thumb = item.product.images[0]?.url;
            return (
              <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded bg-surface-container overflow-hidden shrink-0">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={item.productNameSnapshot}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="font-title text-title-md">{item.productNameSnapshot}</p>
                    <p className="font-mono text-mono-sm text-on-surface-variant">
                      SKU: {item.skuSnapshot} • Qty: {item.quantity} • Unit:{" "}
                      {formatINR(item.unitPricePaise)} • GST {item.gstRateBps / 100}%
                    </p>
                  </div>
                </div>
                <span className="font-mono text-mono-md tabular-nums">
                  {formatINR(item.lineTotalPaise)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-outline">
          {order.addressSnapshot ? (
            <div className="font-body text-body-md text-on-surface-variant">
              <h3 className="font-label text-label-sm uppercase text-on-surface mb-1">
                Delivery Address Snapshot
              </h3>
              <p className="text-on-surface font-medium">{order.addressSnapshot.fullName}</p>
              <p>
                {order.addressSnapshot.email} • {order.addressSnapshot.phone}
              </p>
              <p>{order.addressSnapshot.addressLine1}</p>
              {order.addressSnapshot.addressLine2 ? <p>{order.addressSnapshot.addressLine2}</p> : null}
              <p>
                {order.addressSnapshot.city}, {order.addressSnapshot.state} —{" "}
                <span className="font-mono">{order.addressSnapshot.pinCode}</span>
              </p>
            </div>
          ) : (
            <div />
          )}

          <div className="flex flex-col gap-1.5 font-body text-body-md">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="font-mono tabular-nums">{formatINR(order.subtotalPaise)}</span>
            </div>
            {order.promoDiscountPaise > 0 ? (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Promo ({order.promoCode})</span>
                <span className="font-mono text-success tabular-nums">
                  -{formatINR(order.promoDiscountPaise)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Shipping ({order.shippingMethod})</span>
              <span className="font-mono tabular-nums">{formatINR(order.shippingPaise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Included GST</span>
              <span className="font-mono tabular-nums">{formatINR(order.includedGstPaise)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-outline font-title text-title-md">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums">{formatINR(order.grandTotalPaise)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Shipment, Reservations & Payment History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
          <h2 className="font-headline text-headline-md border-b border-outline pb-2">
            Shipment &amp; Inventory Reservations
          </h2>
          {order.carrierName || order.trackingNumber ? (
            <div className="p-3 rounded bg-surface-container font-body text-body-md">
              <p>
                <strong>Carrier:</strong> {order.carrierName}
              </p>
              <p className="font-mono text-mono-sm">
                <strong>Tracking #:</strong> {order.trackingNumber}
              </p>
              {order.trackingUrl ? (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline text-body-md"
                >
                  Open Carrier Tracking
                </a>
              ) : null}
            </div>
          ) : (
            <p className="font-body text-body-md text-on-surface-variant">
              No shipment tracking recorded yet.
            </p>
          )}

          <div className="divide-y divide-outline">
            {order.reservations.map((r) => (
              <div key={r.id} className="py-2 flex items-center justify-between font-mono text-mono-sm">
                <span>
                  {r.product.sku} × {r.quantity}
                </span>
                <span>{r.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
          <h2 className="font-headline text-headline-md border-b border-outline pb-2">
            Payment Records &amp; Attempts
          </h2>
          {order.payments.map((p) => (
            <div key={p.id} className="border border-outline rounded p-3 flex flex-col gap-1.5">
              <div className="flex justify-between font-mono text-mono-sm">
                <span>
                  {p.provider} • {p.status}
                </span>
                <span>{formatINR(p.amountPaise)}</span>
              </div>
              {p.providerPaymentId ? (
                <p className="font-mono text-mono-sm text-on-surface-variant">
                  Payment Ref: {p.providerPaymentId}
                </p>
              ) : null}
              {p.attempts.map((a) => (
                <p key={a.id} className="font-mono text-mono-sm text-on-surface-variant">
                  Attempt #{a.attemptNumber}: {a.status}
                  {a.errorCode ? ` (${a.errorCode})` : ""}
                </p>
              ))}
            </div>
          ))}
        </section>
      </div>

      {/* Order Timeline */}
      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
        <h2 className="font-headline text-headline-md border-b border-outline pb-2">
          Order Timeline
        </h2>
        <div className="divide-y divide-outline">
          {order.statusHistory.map((h) => (
            <div key={h.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="font-mono text-mono-sm font-semibold">
                  {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}
                </p>
                <p className="font-body text-body-md text-on-surface-variant">{h.note}</p>
              </div>
              <div className="text-right font-mono text-mono-sm text-on-surface-variant">
                <span>
                  {h.actorAdmin
                    ? `Admin: ${h.actorAdmin.user.name ?? h.actorAdmin.user.email}`
                    : "System"}
                </span>
                <span className="block">{h.createdAt.toLocaleString("en-IN")}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
