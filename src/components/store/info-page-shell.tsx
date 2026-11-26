import Link from "next/link";
import { cn } from "@/lib/cn";

export type InfoTabKey =
  | "about"
  | "contact"
  | "faq"
  | "shipping"
  | "returns"
  | "warranty"
  | "privacy";

const INFO_TABS: { key: InfoTabKey; label: string; href: string }[] = [
  { key: "about", label: "About Us", href: "/about" },
  { key: "contact", label: "Contact Us", href: "/contact" },
  { key: "faq", label: "FAQ", href: "/faq" },
  { key: "shipping", label: "Shipping Policy", href: "/policies/shipping" },
  { key: "returns", label: "Returns & Refunds", href: "/policies/returns" },
  { key: "warranty", label: "Warranty", href: "/policies/warranty" },
  { key: "privacy", label: "Privacy & Terms", href: "/policies/privacy" },
];

export function InfoPageShell({
  activeTab,
  children,
}: {
  activeTab: InfoTabKey;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-10 lg:py-12 flex flex-col gap-10 lg:gap-12">
      <div className="border-b border-outline pb-8 flex flex-col gap-6">
        <div>
          <span className="font-label text-label-sm uppercase tracking-widest text-secondary dark:text-primary">
            Client Concierge &amp; Legal
          </span>
          <h1 className="font-headline text-display-md-mobile sm:text-display-md text-on-background mt-1">
            About Us, FAQ &amp; Store Policies
          </h1>
        </div>
        <nav aria-label="Store information sections" className="flex flex-wrap gap-2">
          {INFO_TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-4 py-2 rounded-sm font-label text-label-sm uppercase tracking-wider transition-colors duration-state-change",
                  active
                    ? "bg-primary text-on-primary"
                    : "bg-surface border border-outline text-on-surface hover:border-primary",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
