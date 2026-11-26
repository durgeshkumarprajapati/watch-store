import { cn } from "@/lib/cn";
import Link from "next/link";

const base =
  "inline-flex items-center justify-center gap-2 font-label text-label-lg uppercase tracking-wider transition-[opacity,transform,colors] duration-state-change disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  primary: "px-7 py-3.5 rounded-sm bg-primary text-on-primary hover:opacity-90 active:scale-[0.98]",
  secondary: "px-7 py-3.5 rounded-sm bg-secondary text-on-secondary hover:opacity-90",
  outline: "px-4 py-2 rounded border border-outline bg-surface text-on-surface hover:border-primary",
  ghost: "px-3 py-2 rounded text-on-surface hover:bg-surface-container",
  danger: "px-4 py-2 rounded border border-outline bg-surface text-error hover:border-error",
} as const;

type Variant = keyof typeof variants;
type Common = { variant?: Variant; className?: string; children: React.ReactNode };

export function Button({
  variant = "primary", className, ...props
}: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn(base, variants[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary", className, href, children,
}: Common & { href: string }) {
  return <Link href={href} className={cn(base, variants[variant], className)}>{children}</Link>;
}

export function IconButton({
  label, className, children, ...props
}: { label: string; className?: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn("w-10 h-10 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors duration-state-change", className)}
      {...props}
    >
      {children}
    </button>
  );
}
