import Link from "next/link";
import type { FulfilmentStatus, OrderStatus, PaymentProvider, PaymentStatus } from "@prisma/client";
import { formatINR } from "@/lib/format";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import {
  getAdminOrderSummary,
  listAdminOrders,
  type AdminOrderSort,
} from "@/modules/admin/orders/admin-order-query-service";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];
const FULFILMENT_STATUSES: FulfilmentStatus[] = [
  "AWAITING_PACKING",
  "PACKED",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
];
const PAYMENT_STATUSES: PaymentStatus[] = [
  "PENDING",
  "REQUIRES_GATEWAY",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "REFUNDED",
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("orders.read");
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status =
    typeof sp.status === "string" && ORDER_STATUSES.includes(sp.status as OrderStatus)
      ? (sp.status as OrderStatus)
      : undefined;
  const fulfilmentStatus =
    typeof sp.fulfilmentStatus === "string" &&
    FULFILMENT_STATUSES.includes(sp.fulfilmentStatus as FulfilmentStatus)
      ? (sp.fulfilmentStatus as FulfilmentStatus)
      : undefined;
  const paymentStatus =
    typeof sp.paymentStatus === "string" && PAYMENT_STATUSES.includes(sp.paymentStatus as PaymentStatus)
      ? (sp.paymentStatus as PaymentStatus)
      : undefined;
  const paymentProvider =
    sp.paymentProvider === "COD" || sp.paymentProvider === "RAZORPAY"
      ? (sp.paymentProvider as PaymentProvider)
      : undefined;
  const fromDate = typeof sp.fromDate === "string" && sp.fromDate ? sp.fromDate : undefined;
  const toDate = typeof sp.toDate === "string" && sp.toDate ? sp.toDate : undefined;
  const sort =
    sp.sort === "created-asc" ||
    sp.sort === "total-desc" ||
    sp.sort === "total-asc" ||
    sp.sort === "created-desc"
      ? (sp.sort as AdminOrderSort)
      : "created-desc";
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const [summary, listResult] = await Promise.all([
    getAdminOrderSummary(),
    listAdminOrders({
      q,
      status,
      fulfilmentStatus,
      paymentStatus,
      paymentProvider,
      fromDate,
      toDate,
      sort,
      page,
      pageSize: 15,
    }),
  ]);

  function buildPageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (fulfilmentStatus) params.set("fulfilmentStatus", fulfilmentStatus);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (paymentProvider) params.set("paymentProvider", paymentProvider);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (sort !== "created-desc") params.set("sort", sort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-surface">
          Order Management &amp; Fulfilment
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Process customer orders, manage packing and manual dispatch, and track COD &amp; Razorpay
          settlements.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Orders", value: summary.totalOrders },
          { label: "Pending", value: summary.pendingOrders },
          { label: "Confirmed / Processing", value: summary.confirmedOrders + summary.processingOrders },
          { label: "Packed Ready", value: summary.packedOrders },
          { label: "Shipped / Delivered", value: summary.shippedOrders + summary.deliveredOrders },
          { label: "Cancelled", value: summary.cancelledOrders },
          { label: "Pending COD", value: summary.pendingCodOrders },
          { label: "Awaiting Razorpay", value: summary.awaitingPaymentOrders },
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
          placeholder="Order #, customer, phone, or SKU..."
          className="px-3 py-2 rounded bg-background border border-outline text-body-md lg:col-span-2"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Order Statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="fulfilmentStatus"
          defaultValue={fulfilmentStatus ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Fulfilment States</option>
          {FULFILMENT_STATUSES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          name="paymentProvider"
          defaultValue={paymentProvider ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Payment Methods</option>
          <option value="RAZORPAY">Razorpay</option>
          <option value="COD">Cash on Delivery</option>
        </select>
        <select
          name="paymentStatus"
          defaultValue={paymentStatus ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Payment Statuses</option>
          {PAYMENT_STATUSES.map((ps) => (
            <option key={ps} value={ps}>
              {ps}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="fromDate"
          defaultValue={fromDate ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        />
        <input
          type="date"
          name="toDate"
          defaultValue={toDate ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        />
        <select
          name="sort"
          defaultValue={sort}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="created-desc">Newest First</option>
          <option value="created-asc">Oldest First</option>
          <option value="total-desc">Total High–Low</option>
          <option value="total-asc">Total Low–High</option>
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
          >
            Filter
          </button>
          <Link
            href="/admin/orders"
            className="px-3 py-2 rounded-sm border border-outline font-label text-label-sm uppercase inline-flex items-center"
          >
            Clear
          </Link>
        </div>
      </form>

      {/* Orders Table */}
      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        {listResult.items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-title text-title-md text-on-surface">
              No orders match your current filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Order #</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Customer</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Items</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Total</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Payment</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Order / Fulfilment</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {listResult.items.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3.5">
                      <p className="font-mono text-mono-md font-semibold">{o.orderNumber}</p>
                      <p className="font-mono text-mono-sm text-on-surface-variant">
                        {new Date(o.createdAt).toLocaleString("en-IN")}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-title text-title-md">{o.guestName}</p>
                      <p className="font-mono text-mono-sm text-on-surface-variant">
                        {o.guestEmail} • {o.guestPhone}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-md">{o.itemCount}</td>
                    <td className="px-4 py-3.5 font-mono text-mono-md tabular-nums">
                      {formatINR(o.grandTotalPaise)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm">
                      {o.paymentProvider} • {o.paymentStatus}
                      {o.manualRefundRequired ? (
                        <span className="block text-error">Manual Refund Pending</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm">
                      <span className="block font-semibold">{o.status}</span>
                      <span className="text-on-surface-variant">{o.fulfilmentStatus}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-label text-label-sm uppercase text-primary hover:underline"
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

      {listResult.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="font-body text-body-md text-on-surface-variant">
            Page {listResult.page} of {listResult.totalPages} ({listResult.total} orders)
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
