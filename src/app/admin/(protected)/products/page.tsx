import Link from "next/link";
import type { ProductStatus } from "@prisma/client";
import { Icon } from "@/components/ui/icon";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listAdminBrands } from "@/modules/admin/catalogue/admin-brand-service";
import { listAdminCategories } from "@/modules/admin/catalogue/admin-category-service";
import {
  listAdminProducts,
  type AdminProductSort,
} from "@/modules/admin/catalogue/admin-product-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const STATUS_BADGE: Record<ProductStatus, string> = {
  PUBLISHED: "bg-success text-on-success",
  DRAFT: "bg-surface-container text-on-surface-variant border border-outline",
  ARCHIVED: "bg-error/15 text-error border border-error/40",
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPermission("products.read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const brandId = typeof sp.brandId === "string" && sp.brandId ? sp.brandId : undefined;
  const categoryId = typeof sp.categoryId === "string" && sp.categoryId ? sp.categoryId : undefined;
  const status =
    sp.status === "DRAFT" || sp.status === "PUBLISHED" || sp.status === "ARCHIVED"
      ? sp.status
      : undefined;
  const sort =
    sp.sort === "name-asc" ||
    sp.sort === "price-asc" ||
    sp.sort === "price-desc" ||
    sp.sort === "created-desc" ||
    sp.sort === "updated-desc"
      ? (sp.sort as AdminProductSort)
      : "updated-desc";
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const [result, brands, categories] = await Promise.all([
    listAdminProducts({ q, brandId, categoryId, status, sort, page, pageSize: 12 }),
    listAdminBrands(),
    listAdminCategories(),
  ]);

  const canCreate = hasAdminPermission(admin.permissions, "products.create");

  function buildPageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (brandId) params.set("brandId", brandId);
    if (categoryId) params.set("categoryId", categoryId);
    if (status) params.set("status", status);
    if (sort && sort !== "updated-desc") params.set("sort", sort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-headline-lg text-on-surface">
            Catalogue Management
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Manage timepieces, pricing, HSN/GST tax rates, galleries, and publication status.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/admin/products/new"
            className="px-4 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider inline-flex items-center gap-1.5 self-start"
          >
            <Icon name="add" size={18} /> Add Product
          </Link>
        ) : null}
      </div>

      {/* Filters */}
      <form
        method="GET"
        className="bg-surface border border-outline rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
      >
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name or SKU..."
          className="px-3 py-2 rounded bg-background border border-outline text-body-md lg:col-span-2"
        />
        <select
          name="brandId"
          defaultValue={brandId ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          name="categoryId"
          defaultValue={categoryId ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <div className="flex gap-2">
          <select
            name="sort"
            defaultValue={sort}
            className="flex-1 min-w-0 px-3 py-2 rounded bg-background border border-outline text-body-md"
          >
            <option value="updated-desc">Recently Updated</option>
            <option value="created-desc">Newest</option>
            <option value="name-asc">Name A–Z</option>
            <option value="price-asc">Price Low–High</option>
            <option value="price-desc">Price High–Low</option>
          </select>
          <button
            type="submit"
            className="px-3.5 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
          >
            Filter
          </button>
          {(q || brandId || categoryId || status || sort !== "updated-desc") ? (
            <Link
              href="/admin/products"
              className="px-3 py-2 rounded-sm border border-outline font-label text-label-sm uppercase inline-flex items-center"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {/* Products Table */}
      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center gap-3">
            <p className="font-title text-title-md text-on-surface">No matching products found.</p>
            <Link
              href="/admin/products"
              className="font-label text-label-sm uppercase text-primary hover:underline"
            >
              Reset filters
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-3 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Timepiece &amp; SKU
                  </th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Category
                  </th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    MRP / Selling
                  </th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Stock (Read-Only)
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
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded bg-surface-container overflow-hidden shrink-0">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div>
                          <p className="font-title text-title-md text-on-surface">{item.name}</p>
                          <p className="font-mono text-mono-sm text-on-surface-variant">
                            {item.sku} • {item.brandName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-body text-body-md text-on-surface-variant">
                      {item.categories.map((c) => c.name).join(", ") || "Uncategorized"}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-md tabular-nums">
                      <span className="text-on-surface-variant">{formatInr(item.mrpPaise)}</span> /{" "}
                      <strong>{formatInr(item.pricePaise)}</strong>
                      {item.discountPercent > 0 ? (
                        <span className="block text-mono-sm text-success">
                          {item.discountPercent}% off • GST {item.gstRateBps / 100}%
                        </span>
                      ) : (
                        <span className="block text-mono-sm text-on-surface-variant">
                          GST {item.gstRateBps / 100}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm tabular-nums">
                      {item.stockAvailable} avail • {item.stockReserved} res
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-sm font-label text-label-sm uppercase ${STATUS_BADGE[item.status]}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/admin/products/${item.id}`}
                        className="font-label text-label-sm uppercase tracking-wider text-primary hover:underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pagination */}
      {result.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="font-body text-body-md text-on-surface-variant">
            Page {result.page} of {result.totalPages} ({result.total} products)
          </p>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={buildPageHref(result.page - 1)}
                className="px-3.5 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase"
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link
                href={buildPageHref(result.page + 1)}
                className="px-3.5 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
