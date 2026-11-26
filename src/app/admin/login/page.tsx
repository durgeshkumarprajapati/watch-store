import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { brand } from "@/config/brand";
import { getAuthenticatedAdmin } from "@/modules/admin/admin-auth-service";

export const metadata: Metadata = {
  title: "Admin Sign In",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const admin = await getAuthenticatedAdmin();
  if (admin) redirect("/admin/dashboard");

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12">
      <div className="hidden lg:flex lg:col-span-6 bg-band text-on-band relative flex-col justify-between p-12 overflow-hidden">
        <Image
          src="/images/site/site_heritage.webp"
          alt={`${brand.name} horology atelier`}
          fill
          priority
          sizes="50vw"
          className="object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/60"
        />
        <div className="relative z-10">
          <Logo tone="on-band" />
        </div>
        <div className="relative z-10 max-w-md flex flex-col gap-3">
          <span className="font-label text-label-sm uppercase tracking-widest text-band-primary">
            {brand.adminLabel}
          </span>
          <h2 className="font-display text-display-md text-balance">
            Restricted Operations &amp; Access Control.
          </h2>
          <p className="font-body text-body-lg text-on-band-variant">
            Authorized {brand.name} administrators only. All access attempts are logged.
          </p>
        </div>
      </div>

      <div className="lg:col-span-6 flex flex-col justify-between p-6 sm:p-12">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-label text-label-lg uppercase tracking-wider text-on-surface-variant hover:text-primary"
          >
            <Icon name="arrow_back" size={18} />
            <span>Back to Store</span>
          </Link>
          <ThemeToggle />
        </div>

        <main className="w-full max-w-md mx-auto my-auto py-10 flex flex-col gap-6">
          <div>
            <h1 className="font-headline text-display-md-mobile sm:text-display-md text-on-background">
              Admin Console
            </h1>
            <p className="font-body text-body-md text-on-surface-variant mt-1">
              Sign in with your provisioned administrator credentials.
            </p>
          </div>

          <AdminLoginForm />
        </main>

        <p className="font-body text-body-md text-center text-on-surface-variant">
          {brand.name} • {brand.adminLabel}
        </p>
      </div>
    </div>
  );
}
