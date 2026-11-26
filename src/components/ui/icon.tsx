import { cn } from "@/lib/cn";

export function Icon({ name, className, size = 20, filled = false }: { name: string; className?: string; size?: number; filled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("material-symbols-outlined", className)}
      style={{ fontSize: size, fontVariationSettings: `"FILL" ${filled ? 1 : 0}, "wght" 400` }}
    >
      {name}
    </span>
  );
}
