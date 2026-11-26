import { InventoryOperationForm } from "@/components/admin/inventory/inventory-operation-form";
import { InventorySubnav } from "@/components/admin/inventory/inventory-subnav";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listInventoryOptions } from "@/modules/admin/inventory/inventory-query-service";

export default async function AdminStockAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("inventory.update");
  const sp = await searchParams;
  const defaultProductId = typeof sp.productId === "string" ? sp.productId : undefined;
  const products = await listInventoryOptions();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-surface">Stock Adjustments</h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Reconcile physical cycle counts safely while protecting reserved customer stock.
        </p>
      </div>
      <InventorySubnav active="adjustments" canUpdate={true} />
      <InventoryOperationForm
        mode="adjustment"
        products={products}
        defaultProductId={defaultProductId}
      />
    </div>
  );
}
