import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listAdminBrands } from "@/modules/admin/catalogue/admin-brand-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

export default async function AdminBrandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPermission("brands.read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const brands = await listAdminBrands({ q });
  const canManage = hasAdminPermission(admin.permissions, "brands.manage");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-headline-lg text-on-surface">Watchmaker Brands</h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Manage horology maisons, descriptions, logos, and storefront visibility.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/admin/brands/new"
            className="px-4 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider inline-flex items-center gap-1.5 self-start"
          >
            <Icon name="add" size={18} /> Add Brand
          </Link>
        ) : null}
      </div>

      <form method="GET" className="flex gap-2 max-w-md">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search brands..."
          className="flex-1 px-3 py-2 rounded bg-surface border border-outline text-body-md"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
        >
          Search
        </button>
      </form>

      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-outline bg-surface-container">
              <th className="px-4 py-3 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                Brand
              </th>
              <th className="px-4 py-3 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                Slug
              </th>
              <th className="px-4 py-3 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                Products
              </th>
              <th className="px-4 py-3 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                Status
              </th>
              <th className="px-4 py-3 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline">
            {brands.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3.5 font-title text-title-md text-on-surface">{b.name}</td>
                <td className="px-4 py-3.5 font-mono text-mono-sm text-on-surface-variant">
                  {b.slug}
                </td>
                <td className="px-4 py-3.5 font-mono text-mono-md">{b.productCount}</td>
                <td className="px-4 py-3.5">
                  <span
                    className={`px-2.5 py-0.5 rounded-sm font-label text-label-sm uppercase ${
                      b.isActive
                        ? "bg-success text-on-success"
                        : "bg-surface-container text-on-surface-variant border border-outline"
                    }`}
                  >
                    {b.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <Link
                    href={`/admin/brands/${b.id}`}
                    className="font-label text-label-sm uppercase text-primary hover:underline"
                  >
                    {canManage ? "Edit" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
