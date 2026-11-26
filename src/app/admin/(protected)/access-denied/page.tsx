import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export default function AdminAccessDeniedPage() {
  return (
    <div className="max-w-lg mx-auto my-12 bg-surface border border-outline rounded-md p-8 text-center flex flex-col items-center gap-4">
      <Icon name="lock" size={36} className="text-error" />
      <h1 className="font-headline text-headline-lg text-on-surface">Access Denied</h1>
      <p className="font-body text-body-md text-on-surface-variant">
        Your administrator account does not have permission to view this section.
      </p>
      <Link
        href="/admin/dashboard"
        className="px-6 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
