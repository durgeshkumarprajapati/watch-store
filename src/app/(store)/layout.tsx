import { StoreHeader } from "@/components/store/store-header";
import { StoreFooter } from "@/components/store/store-footer";
import { getAuthenticatedCustomer } from "@/modules/auth/session-service";
import { getCartCount } from "@/modules/cart/cart-store";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [cartCount, customer] = await Promise.all([getCartCount(), getAuthenticatedCustomer()]);
  return (
    <div className="min-h-screen flex flex-col">
      <StoreHeader cartCount={cartCount} signedIn={Boolean(customer)} />
      <main className="flex-1">{children}</main>
      <StoreFooter />
    </div>
  );
}
