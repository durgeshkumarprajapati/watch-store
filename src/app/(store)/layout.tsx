import type { Metadata } from "next";
import { CustomerPwaManager } from "@/components/pwa/customer-pwa-manager";
import { StoreHeader } from "@/components/store/store-header";
import { StoreFooter } from "@/components/store/store-footer";
import { getAuthenticatedCustomer } from "@/modules/auth/session-service";
import { getCartCount } from "@/modules/cart/cart-store";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WatchStore",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [cartCount, customer] = await Promise.all([getCartCount(), getAuthenticatedCustomer()]);
  return (
    <div className="min-h-screen flex flex-col pb-[env(safe-area-inset-bottom)]">
      <StoreHeader cartCount={cartCount} signedIn={Boolean(customer)} />
      <main className="flex-1">{children}</main>
      <StoreFooter />
      <script
        dangerouslySetInnerHTML={{
          __html:
            'window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__wsInstallPrompt=e;});',
        }}
      />
      <CustomerPwaManager />
    </div>
  );
}
