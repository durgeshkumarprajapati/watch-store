import { cn } from "@/lib/cn";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full px-4 py-3 rounded border border-outline bg-background text-on-surface font-body text-body-md placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors duration-state-change",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("font-label text-label-lg text-on-surface", className)} {...props} />;
}
