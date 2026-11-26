import Link from "next/link";
import { InventorySubnav } from "@/components/admin/inventory/inventory-subnav";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listAdminBrands } from "@/modules/admin/catalogue/admin-brand-service";
import { listAdminCategories } from "@/modules/admin/catalogue/admin-category-service";
import {
  getInventoryOverviewSummary,
  listInventoryItems,
  type InventorySort,
} from "@/modules/admin/inventory/inventory-query-service";
import type { InventoryStockStatus } from "@/modules/admin/inventory/inventory-validation";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

const STATUS_STYLE: Record<InventoryStockStatus, string> = {
  IN_STOCK: "bg-success text-on-success",
  LOW_STOCK: "bg-primary text-on-primary",
  OUT_OF_STOCK: "bg-error text-on-error",
};

const STATUS_LABEL: Record<InventoryStockStatus, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPermission("inventory.read");
  const canUpdate = hasAdminPermission(admin.permissions, "inventory.update");
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : undefined;
  const brandId = typeof sp.brandId === "string" && sp.brandId ? sp.brandId : undefined;
  const categoryId = typeof sp.categoryId === "string" && sp.categoryId ? sp.categoryId : undefined;
  const stockStatus =
    sp.stockStatus === "IN_STOCK" ||
    sp.stockStatus === "LOW_STOCK" ||
    sp.stockStatus === "OUT_OF_STOCK"
      ? (sp.stockStatus as InventoryStockStatus)
      : undefined;
  const sort =
    sp.sort === "available-asc" ||
    sp.sort === "available-desc" ||
    sp.sort === "name-asc" ||
    sp.sort === "updated-desc"
      ? (sp.sort as InventorySort)
      : "updated-desc";
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const [summary, listResult, brands, categories] = await Promise.all([
    getInventoryOverviewSummary(),
    listInventoryItems({ q, brandId, categoryId, stockStatus, sort, page, pageSize: 12 }),
    listAdminBrands(),
    listAdminCategories(),
  ]);

  function buildPageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (brandId) params.set("brandId", brandId);
    if (categoryId) params.set("categoryId", categoryId);
    if (stockStatus) params.set("stockStatus", stockStatus);
    if (sort !== "updated-desc") params.set("sort", sort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/inventory?${qs}` : "/admin/inventory";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-surface">
          Inventory &amp; Stock Control
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Monitor physical, reserved, and available stock across all timepieces.
        </p>
      </div>

      <InventorySubnav active="overview" canUpdate={canUpdate} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Products Tracked", value: summary.totalProducts },
          { label: "Physical Units", value: summary.totalPhysicalUnits },
          { label: "Reserved Units", value: summary.totalReservedUnits },
          { label: "Available Units", value: summary.totalAvailableUnits },
          { label: "Low-Stock SKUs", value: summary.lowStockProducts },
          { label: "Out-of-Stock SKUs", value: summary.outOfStockProducts },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-surface border border-outline rounded-md p-4 flex flex-col gap-1"
          >
            <span className="font-label text-label-sm uppercase text-on-surface-variant">
              {card.label}
            </span>
            <span className="font-mono text-headline-md text-on-surface">{card.value}</span>
          </div>
        ))}
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
          placeholder="Search product or SKU..."
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
          name="stockStatus"
          defaultValue={stockStatus ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Stock States</option>
          <option value="IN_STOCK">In Stock</option>
          <option value="LOW_STOCK">Low Stock</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
        </select>
        <div className="flex gap-2">
          <select
            name="sort"
            defaultValue={sort}
            className="flex-1 min-w-0 px-3 py-2 rounded bg-background border border-outline text-body-md"
          >
            <option value="updated-desc">Recently Updated</option>
            <option value="available-asc">Available Low–High</option>
            <option value="available-desc">Available High–Low</option>
            <option value="name-asc">Name A–Z</option>
          </select>
          <button
            type="submit"
            className="px-3.5 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
          >
            Filter
          </button>
          {(q || brandId || categoryId || stockStatus || sort !== "updated-desc") ? (
            <Link
              href="/admin/inventory"
              className="px-3 py-2 rounded-sm border border-outline font-label text-label-sm uppercase inline-flex items-center"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {/* Inventory Table */}
      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        {listResult.items.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center gap-3">
            <p className="font-title text-title-md text-on-surface">
              No inventory records match the selected filters.
            </p>
            <Link
              href="/admin/inventory"
              className="font-label text-label-sm uppercase text-primary hover:underline"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-3 font-label text-label-sm uppercase text-on-surface-variant">
                    Product &amp; SKU
                  </th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase text-on-surface-variant">
                    Physical
                  </th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase text-on-surface-variant">
                    Reserved
                  </th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase text-on-surface-variant">
                    Available
                  </th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase text-on-surface-variant">
                    Threshold
                  </th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase text-on-surface-variant">
                    Status
                  </th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase text-on-surface-variant">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {listResult.items.map((item) => (
                  <tr key={item.productId}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-surface-container overflow-hidden shrink-0">
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
                    <td className="px-4 py-3.5 font-mono text-mono-md tabular-nums">
                      {item.physicalStock}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-md tabular-nums">
                      {item.reserved}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-md font-semibold tabular-nums">
                      {item.available}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm text-on-surface-variant">
                      ≤ {item.lowStockThreshold}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-sm font-label text-label-sm uppercase ${STATUS_STYLE[item.stockStatus]}`}
                      >
                        {STATUS_LABEL[item.stockStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/admin/inventory/${item.productId}`}
                        className="font-label text-label-sm uppercase text-primary hover:underline"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {listResult.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="font-body text-body-md text-on-surface-variant">
            Page {listResult.page} of {listResult.totalPages} ({listResult.total} products)
          </p>
          <div className="flex gap-2">
            {listResult.page > 1 ? (
              <Link
                href={buildPageHref(listResult.page - 1)}
                className="px-3.5 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase"
              >
                Previous
              </Link>
            ) : null}
            {listResult.page < listResult.totalPages ? (
              <Link
                href={buildPageHref(listResult.page + 1)}
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
