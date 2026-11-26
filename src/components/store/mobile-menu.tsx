"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { brand } from "@/config/brand";
import { mobileNav } from "@/config/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" aria-label="Open Menu" aria-expanded={open} onClick={() => setOpen(true)} className="w-10 h-10 flex items-center justify-center text-on-surface">
        <Icon name="menu" size={24} />
      </button>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-50 bg-surface p-6 flex flex-col gap-6 transition-opacity",
          open ? "opacity-100 visible duration-surface-enter" : "opacity-0 invisible duration-surface-exit",
        )}
      >
        <div className="flex items-center justify-between border-b border-outline pb-4">
          <span className="font-headline text-headline-md">{brand.wordmark}</span>
          <button type="button" aria-label="Close Menu" onClick={() => setOpen(false)} className="w-10 h-10 flex items-center justify-center">
            <Icon name="close" size={24} />
          </button>
        </div>
        <nav className="flex flex-col gap-4">
          {mobileNav.map((item) => (
            <Link key={item.label} href={item.href} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} className="font-headline text-headline-md py-2 border-b border-outline">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
