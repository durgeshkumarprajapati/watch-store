import type { Metadata } from "next";
import { AccountShell } from "@/components/store/account/account-shell";
import { AddressesManager } from "@/components/store/account/addresses-manager";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";
import { listCustomerAddresses } from "@/modules/customers/customer-service";

export const metadata: Metadata = {
  title: "Saved Addresses",
  description: "Manage your saved delivery addresses.",
};

export const dynamic = "force-dynamic";

export default async function AccountAddressesPage() {
  const customer = await requireAuthenticatedCustomerPage();
  const addresses = await listCustomerAddresses(customer.id);

  return (
    <AccountShell customer={customer} activeTab="addresses">
      <AddressesManager addresses={addresses} />
    </AccountShell>
  );
}
