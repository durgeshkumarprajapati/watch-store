import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { ThresholdEditor } from "@/components/admin/inventory/threshold-editor";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { getProductInventoryDetail } from "@/modules/admin/inventory/inventory-query-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

export default async function AdminProductInventoryDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const admin = await requireAdminPermission("inventory.read");
  const canUpdate = hasAdminPermission(admin.permissions, "inventory.update");
  const { productId } = await params;

  const detail = await getProductInventoryDetail(productId);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/inventory"
            className="inline-flex items-center gap-1.5 font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-primary mb-2"
          >
            <Icon name="arrow_back" size={16} /> Back to Inventory
          </Link>
          <h1 className="font-headline text-headline-lg text-on-surface">{detail.name}</h1>
          <p className="font-mono text-mono-sm text-on-surface-variant">
            {detail.sku} • {detail.brandName}
          </p>
        </div>

        {canUpdate ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/inventory/inward?productId=${detail.productId}`}
              className="px-3.5 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase"
            >
              Stock Inward
            </Link>
            <Link
              href={`/admin/inventory/outward?productId=${detail.productId}`}
              className="px-3.5 py-2 rounded-sm border border-outline font-label text-label-sm uppercase"
            >
              Stock Outward
            </Link>
            <Link
              href={`/admin/inventory/adjustments?productId=${detail.productId}`}
              className="px-3.5 py-2 rounded-sm border border-outline font-label text-label-sm uppercase"
            >
              Adjust Count
            </Link>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-outline rounded-md p-4">
          <span className="font-label text-label-sm uppercase text-on-surface-variant">
            Physical Stock
          </span>
          <p className="font-mono text-headline-md mt-1">{detail.physicalStock}</p>
        </div>
        <div className="bg-surface border border-outline rounded-md p-4">
          <span className="font-label text-label-sm uppercase text-on-surface-variant">
            Reserved for Orders
          </span>
          <p className="font-mono text-headline-md mt-1">{detail.reserved}</p>
        </div>
        <div className="bg-surface border border-outline rounded-md p-4">
          <span className="font-label text-label-sm uppercase text-on-surface-variant">
            Available for Sale
          </span>
          <p className="font-mono text-headline-md mt-1">{detail.available}</p>
        </div>
        <div className="bg-surface border border-outline rounded-md p-4">
          <ThresholdEditor
            productId={detail.productId}
            initialThreshold={detail.lowStockThreshold}
            canUpdate={canUpdate}
          />
        </div>
      </div>

      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-outline flex items-center justify-between">
          <h2 className="font-headline text-headline-md">Recent Stock Movements</h2>
          <Link
            href={`/admin/inventory/movements?productId=${detail.productId}`}
            className="font-label text-label-sm uppercase text-primary hover:underline"
          >
            View All
          </Link>
        </div>
        {detail.movements.length === 0 ? (
          <p className="p-6 font-body text-body-md text-on-surface-variant">
            No movements recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-2.5 font-label text-label-sm uppercase">Type</th>
                  <th className="px-4 py-2.5 font-label text-label-sm uppercase">Delta Avail</th>
                  <th className="px-4 py-2.5 font-label text-label-sm uppercase">Physical</th>
                  <th className="px-4 py-2.5 font-label text-label-sm uppercase">Actor</th>
                  <th className="px-4 py-2.5 font-label text-label-sm uppercase">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {detail.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-mono text-mono-sm">{m.movementLabel}</td>
                    <td className="px-4 py-3 font-mono text-mono-md">
                      {m.deltaAvailable >= 0 ? `+${m.deltaAvailable}` : m.deltaAvailable}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm">
                      {m.previousPhysical ?? "—"} → {m.newPhysical ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md">{m.actorLabel}</td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">
                      {m.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
