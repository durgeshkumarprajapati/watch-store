import Link from "next/link";
import type { Customer } from "@prisma/client";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/modules/auth/actions";

export type AccountTabKey =
  | "overview"
  | "orders"
  | "profile"
  | "addresses"
  | "notifications"
  | "security";

const ACCOUNT_NAV: { key: AccountTabKey; label: string; href: string; icon: string }[] = [
  { key: "overview", label: "Account Overview", href: "/account", icon: "dashboard" },
  { key: "orders", label: "My Orders", href: "/account/orders", icon: "package_2" },
  { key: "profile", label: "Profile", href: "/account/profile", icon: "person" },
  { key: "addresses", label: "Saved Addresses", href: "/account/addresses", icon: "location_on" },
  { key: "notifications", label: "Notifications", href: "/account/notifications", icon: "notifications" },
  { key: "security", label: "Security & Password", href: "/account/security", icon: "lock" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "WS";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function AccountShell({
  customer,
  activeTab,
  children,
}: {
  customer: Customer;
  activeTab: AccountTabKey;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-8 lg:py-10 flex flex-col gap-8">
      {/* Welcome Banner */}
      <section className="bg-surface border border-outline rounded-md p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-secondary text-on-secondary flex items-center justify-center font-headline text-headline-md shrink-0">
            {getInitials(customer.fullName)}
          </div>
          <div>
            <span className="font-label text-label-sm uppercase tracking-widest text-secondary dark:text-primary">
              Verified Collector
            </span>
            <h1 className="font-headline text-headline-lg text-on-surface">
              Welcome back, {customer.fullName}
            </h1>
            <p className="font-body text-body-md text-on-surface-variant">
              {customer.email}
              {customer.phone ? ` • ${customer.phone}` : ""}
            </p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-sm border border-outline font-label text-label-lg uppercase tracking-wider text-on-surface hover:border-primary transition-colors duration-state-change"
          >
            Sign Out
          </button>
        </form>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <aside className="lg:col-span-3 bg-surface border border-outline rounded-md p-4 flex flex-col gap-1">
          {ACCOUNT_NAV.map((item) => {
            const active = item.key === activeTab;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-4 py-3 rounded flex items-center gap-3 transition-colors duration-state-change",
                  active
                    ? "bg-primary text-on-primary font-label text-label-lg"
                    : "text-on-surface hover:bg-surface-container font-body text-body-md",
                )}
              >
                <Icon name={item.icon} size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <Link
            href="/account/wishlist"
            className="px-4 py-3 rounded flex items-center gap-3 text-on-surface hover:bg-surface-container font-body text-body-md transition-colors duration-state-change"
          >
            <Icon name="favorite_border" size={20} />
            <span>Saved Wishlist</span>
          </Link>
        </aside>

        <div className="lg:col-span-9 flex flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
