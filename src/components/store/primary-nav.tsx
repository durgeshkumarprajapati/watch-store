"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { primaryNav, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";

function isActive(item: NavItem, pathname: string, params: URLSearchParams) {
  if (item.param) return pathname === "/products" && params.get(item.param.key) === item.param.value;
  if (item.href === "/products") {
    return pathname === "/" || (pathname === "/products" && !params.get("type") && !params.get("gender"));
  }
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function PrimaryNav({ interactive = true }: { interactive?: boolean }) {
  return interactive ? <ActiveNav /> : <NavList active={() => false} />;
}

function ActiveNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  return <NavList active={(i) => isActive(i, pathname, params)} />;
}

function NavList({ active }: { active: (i: NavItem) => boolean }) {
  return (
    <nav aria-label="Primary Navigation" className="hidden lg:flex items-center gap-8">
      {primaryNav.map((item) => {
        const on = active(item);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "font-label text-label-lg uppercase tracking-wider transition-colors duration-state-change",
              on ? "text-secondary dark:text-primary border-b-2 border-primary py-1" : "text-on-surface hover:text-secondary dark:hover:text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
