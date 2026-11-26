"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

const subscribe = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label="Toggle Light/Dark Mode"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center border border-outline text-on-surface hover:border-primary transition-colors duration-state-change",
        className,
      )}
    >
      <Icon name={isDark ? "light_mode" : "dark_mode"} />
    </button>
  );
}
