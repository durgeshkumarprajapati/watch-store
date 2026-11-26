import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { brand } from "@/config/brand";
import { getServerEnv } from "@/config/env";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { ADMIN_PERMISSIONS, ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";

export const metadata: Metadata = {
  title: "Settings — WatchStore Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdminPermission("roles.read");
  const env = getServerEnv();

  const integrations = [
    { name: "PostgreSQL Database", configured: Boolean(env.DATABASE_URL) },
    { name: "Razorpay Payments", configured: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) },
    { name: "Shiprocket Shipping", configured: Boolean(env.SHIPROCKET_API_EMAIL && env.SHIPROCKET_API_PASSWORD) },
    { name: "Resend Transactional Email", configured: Boolean(env.RESEND_API_KEY) },
    {
      name: "VAPID Browser Push",
      configured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT),
    },
    {
      name: "Cloudinary Media Storage",
      configured: Boolean(
        env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
      ),
    },
    {
      name: "Google Sheets Sync",
      configured: Boolean(
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
      ),
    },
    { name: "Scheduler Cron Secret", configured: Boolean(env.CRON_SECRET) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-background">Store &amp; Integration Settings</h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          Centralized configuration status for {brand.name} (secrets remain server-only).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-5 rounded bg-surface border border-outline flex flex-col gap-3">
          <h2 className="font-title text-title-md text-on-surface">Brand &amp; RBAC Summary</h2>
          <dl className="grid grid-cols-2 gap-2 text-body-md">
            <dt className="text-on-surface-variant">Brand Name</dt>
            <dd className="font-semibold">{brand.name}</dd>
            <dt className="text-on-surface-variant">Admin Label</dt>
            <dd>{brand.adminLabel}</dd>
            <dt className="text-on-surface-variant">RBAC Roles</dt>
            <dd className="font-mono">{Object.keys(ADMIN_ROLE_DEFINITIONS).length}</dd>
            <dt className="text-on-surface-variant">RBAC Permissions</dt>
            <dd className="font-mono">{ADMIN_PERMISSIONS.length}</dd>
          </dl>
        </section>

        <section className="p-5 rounded bg-surface border border-outline flex flex-col gap-3">
          <h2 className="font-title text-title-md text-on-surface">External Integrations</h2>
          <div className="flex flex-col gap-2">
            {integrations.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between py-1.5 border-b border-outline/50 last:border-b-0"
              >
                <span className="text-body-md text-on-surface">{item.name}</span>
                <Badge tone={item.configured ? "success" : "muted"}>
                  {item.configured ? "Configured" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
