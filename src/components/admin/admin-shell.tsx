"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { brand } from "@/config/brand";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { adminLogoutAction } from "@/modules/admin/admin-actions";
import { adminNav, adminSettingsNav, type AdminNavItem } from "./admin-nav";

function NavLink({
  item,
  active,
  onClick,
  className,
}: {
  item: AdminNavItem;
  active: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-3.5 py-2.5 rounded transition-colors duration-state-change",
        active
          ? "bg-primary text-on-primary font-label text-label-lg"
          : "text-on-surface hover:bg-surface-container font-body text-body-md",
        className,
      )}
    >
      <Icon name={item.icon} /> {item.label}
    </Link>
  );
}

function SidebarContent({
  pathname,
  permissions,
  onNavigate,
}: {
  pathname: string;
  permissions: Set<string>;
  onNavigate?: () => void;
}) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const visibleNav = adminNav.filter((item) => permissions.has(item.permission));
  const showSettings = permissions.has(adminSettingsNav.permission);

  return (
    <>
      <div className="h-20 px-6 flex items-center gap-3 border-b border-outline">
        <Icon name={brand.logo.icon} size={24} className="text-primary" />
        <div>
          <span className="font-headline text-title-lg block leading-none">{brand.wordmark}</span>
          <span className="font-label text-label-sm uppercase tracking-widest text-on-surface-variant">
            {brand.adminLabel}
          </span>
        </div>
      </div>
      <nav aria-label="Admin Navigation" className="flex-1 p-4 flex flex-col gap-1">
        {visibleNav.map((i) => (
          <NavLink key={i.href} item={i} active={isActive(i.href)} onClick={onNavigate} />
        ))}
        <NavLink
          item={{ href: "/admin/inbox", label: "Inbox & Push", icon: "notifications" } as AdminNavItem}
          active={isActive("/admin/inbox")}
          onClick={onNavigate}
        />
        {showSettings && (
          <NavLink
            item={adminSettingsNav}
            active={isActive(adminSettingsNav.href)}
            onClick={onNavigate}
            className="mt-auto"
          />
        )}
      </nav>
    </>
  );
}

export function AdminShell({
  title,
  user,
  children,
}: {
  title: string;
  user: { name: string; initials: string; roles: string[]; permissions: string[] };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const permSet = new Set(user.permissions);

  return (
    <div className="min-h-screen flex bg-background text-on-background">
      <aside className="w-64 shrink-0 bg-surface border-r border-outline hidden lg:flex flex-col min-h-screen">
        <SidebarContent pathname={pathname} permissions={permSet} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-64 h-full bg-surface border-r border-outline flex flex-col">
            <SidebarContent pathname={pathname} permissions={permSet} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-20 bg-surface border-b border-outline px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Open menu"
              className="lg:hidden w-10 h-10 rounded-full flex items-center justify-center border border-outline"
              onClick={() => setOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span className="font-body text-body-md text-on-surface-variant">
              Admin / <strong className="text-on-surface">{title}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-2.5 pl-2 border-l border-outline">
              <div className="w-9 h-9 rounded-full bg-secondary text-on-secondary flex items-center justify-center font-label text-label-sm">
                {user.initials}
              </div>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="font-label text-label-lg text-on-surface">{user.name}</span>
                <span className="font-mono text-mono-sm text-on-surface-variant">{user.roles[0] ?? "ADMIN"}</span>
              </div>
            </div>
            <form action={adminLogoutAction}>
              <button
                type="submit"
                className="px-3.5 py-2 rounded border border-outline font-label text-label-sm uppercase tracking-wider text-on-surface hover:border-primary transition-colors duration-state-change"
              >
                Sign Out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8 flex flex-col gap-8">{children}</main>
      </div>
    </div>
  );
}
