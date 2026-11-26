import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { AccountShell } from "@/components/store/account/account-shell";
import { formatINR } from "@/lib/format";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";
import { listCustomerAddresses, listCustomerOrders } from "@/modules/customers/customer-service";

export const metadata: Metadata = {
  title: "My Account",
  description: "Manage your WatchStore orders, addresses, and profile.",
};

export const dynamic = "force-dynamic";

export default async function AccountOverviewPage() {
  const customer = await requireAuthenticatedCustomerPage();
  const [orders, addresses] = await Promise.all([
    listCustomerOrders(customer.id, { page: 1, pageSize: 3 }),
    listCustomerAddresses(customer.id),
  ]);
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  return (
    <AccountShell customer={customer} activeTab="overview">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-title text-title-lg text-on-surface">Recent Orders</h2>
            <Link href="/account/orders" className="font-label text-label-sm uppercase tracking-wider text-secondary dark:text-primary hover:underline">
              View All ({orders.total})
            </Link>
          </div>
          {orders.items.length === 0 ? (
            <p className="font-body text-body-md text-on-surface-variant">You have not placed any orders yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {orders.items.map((o) => (
                <Link
                  key={o.id}
                  href={`/account/orders/${o.id}`}
                  className="p-3 rounded border border-outline hover:border-primary flex items-center justify-between gap-3 transition-colors duration-state-change"
                >
                  <div>
                    <p className="font-mono text-mono-sm text-on-surface">{o.orderNumber}</p>
                    <p className="font-body text-body-md text-on-surface-variant">
                      {o.items.length} {o.items.length === 1 ? "item" : "items"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-mono-md text-on-surface tabular-nums">{formatINR(o.grandTotalPaise)}</p>
                    <Badge tone={o.status === "CONFIRMED" ? "success" : "secondary"}>{o.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-title text-title-lg text-on-surface">Default Delivery Address</h2>
            <Link href="/account/addresses" className="font-label text-label-sm uppercase tracking-wider text-secondary dark:text-primary hover:underline">
              Manage ({addresses.length})
            </Link>
          </div>
          {defaultAddress ? (
            <div className="font-body text-body-md text-on-surface-variant">
              <p className="text-on-surface font-semibold">{defaultAddress.label || "Default Address"}</p>
              <p>{defaultAddress.addressLine1}</p>
              <p>
                {defaultAddress.city}, {defaultAddress.state} — <span className="font-mono">{defaultAddress.pinCode}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-on-surface-variant font-body text-body-md">
              <Icon name="location_on" size={18} />
              <span>No saved address yet.</span>
            </div>
          )}
        </section>
      </div>
    </AccountShell>
  );
}
