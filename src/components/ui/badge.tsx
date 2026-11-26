import { cn } from "@/lib/cn";

const tones = {
  secondary: "bg-secondary text-on-secondary",
  primary: "bg-primary text-on-primary",
  success: "bg-success text-on-success",
  error: "bg-error text-on-error",
  muted: "bg-surface-container text-on-surface-variant",
} as const;

export function Badge({ tone = "secondary", className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-sm font-label text-label-sm uppercase tracking-wider", tones[tone], className)}>
      {children}
    </span>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-primary text-on-primary font-mono text-mono-sm flex items-center justify-center", className)}>
      {count}
    </span>
  );
}
