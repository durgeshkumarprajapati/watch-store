import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { ShipmentActionsPanel } from "@/components/admin/shipping/shipment-actions-panel";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";
import { getAdminShipmentDetail } from "@/modules/shipping/application/shipping-query-service";
import { isShiprocketConfigured } from "@/modules/shipping/infrastructure/shiprocket-client";

export default async function AdminShipmentDetailPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const admin = await requireAdminPermission("shipments.read");
  const { shipmentId } = await params;
  const shipment = await getAdminShipmentDetail(shipmentId);
  if (!shipment) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/shipments"
          className="inline-flex items-center gap-1.5 font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-primary mb-2"
        >
          <Icon name="arrow_back" size={16} /> Back to Shipments
        </Link>
        <h1 className="font-headline text-headline-lg text-on-surface">
          Shipment for {shipment.order.orderNumber}
        </h1>
        <p className="font-mono text-mono-sm text-on-surface-variant">
          {shipment.provider} • {shipment.status}
          {shipment.awbCode ? ` • AWB: ${shipment.awbCode}` : ""}
        </p>
      </div>

      <ShipmentActionsPanel
        orderId={shipment.orderId}
        shiprocketConfigured={isShiprocketConfigured()}
        activeShipment={{
          id: shipment.id,
          provider: shipment.provider,
          isManual: shipment.isManual,
          status: shipment.status,
          shiprocketOrderId: shipment.shiprocketOrderId,
          awbCode: shipment.awbCode,
          labelUrl: shipment.labelUrl,
          pickupScheduledAt: shipment.pickupScheduledAt?.toISOString() ?? null,
          reconciliationRequired: shipment.reconciliationRequired,
        }}
        canManage={hasAdminPermission(admin.permissions, "shipments.manage")}
        canCancel={hasAdminPermission(admin.permissions, "shipments.cancel")}
        canRetry={hasAdminPermission(admin.permissions, "shipments.retry")}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-2 font-body text-body-md">
          <h2 className="font-headline text-headline-md border-b border-outline pb-2">
            Shipment &amp; Package Details
          </h2>
          <p>
            <strong>Order:</strong>{" "}
            <Link href={`/admin/orders/${shipment.orderId}`} className="text-primary underline font-mono">
              {shipment.order.orderNumber}
            </Link>
          </p>
          <p>
            <strong>Courier:</strong> {shipment.courierName ?? "Not assigned"}
          </p>
          <p className="font-mono text-mono-sm">
            <strong>Shiprocket Order / Shipment:</strong> {shipment.shiprocketOrderId ?? "—"} /{" "}
            {shipment.shiprocketShipmentId ?? "—"}
          </p>
          <p className="font-mono text-mono-sm">
            <strong>Package:</strong> {shipment.weightKg} kg ({shipment.lengthCm}×{shipment.breadthCm}×
            {shipment.heightCm} cm)
          </p>
          {shipment.lastError ? (
            <p className="text-error">
              <strong>Last Error:</strong> {shipment.lastError}
            </p>
          ) : null}
        </section>

        <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-2 font-body text-body-md">
          <h2 className="font-headline text-headline-md border-b border-outline pb-2">
            Delivery Address Snapshot
          </h2>
          {shipment.order.addressSnapshot ? (
            <>
              <p className="font-medium">{shipment.order.addressSnapshot.fullName}</p>
              <p>{shipment.order.addressSnapshot.addressLine1}</p>
              <p>
                {shipment.order.addressSnapshot.city}, {shipment.order.addressSnapshot.state} —{" "}
                <span className="font-mono">{shipment.order.addressSnapshot.pinCode}</span>
              </p>
            </>
          ) : (
            <p className="text-on-surface-variant">No address snapshot.</p>
          )}
        </section>
      </div>

      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
        <h2 className="font-headline text-headline-md border-b border-outline pb-2">
          Shipment Timeline
        </h2>
        <div className="divide-y divide-outline">
          {shipment.statusHistory.map((h) => (
            <div key={h.id} className="py-2.5 flex justify-between gap-4">
              <div>
                <p className="font-mono text-mono-sm font-semibold">
                  {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}
                </p>
                <p className="font-body text-body-md text-on-surface-variant">
                  {h.note}
                  {h.location ? ` (${h.location})` : ""}
                </p>
              </div>
              <span className="font-mono text-mono-sm text-on-surface-variant">
                {h.eventAt.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
