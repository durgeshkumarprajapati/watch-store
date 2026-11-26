import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/** Header used by cart, checkout and policy pages in the Stitch design. */
export function MinimalShell({ actions, children }: { actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface border-b border-outline">
        <div className="px-6 h-20 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            {actions}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
