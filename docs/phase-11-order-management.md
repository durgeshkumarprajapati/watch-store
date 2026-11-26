# Phase 11 — Admin Order Management Architecture

## Routes
- `/admin/orders`: Database-derived summary metrics, server-side search (order #, customer name/email/phone, product name, SKU), filters (order status, fulfilment status, payment provider, payment status, date range), sorting, and pagination.
- `/admin/orders/[orderId]`: Central order management view with immutable item snapshots, delivery address snapshot, payment records & attempts (secrets excluded), inventory reservations, chronological timeline (`System` vs `Admin`), and RBAC-gated fulfilment/cancellation controls.

## Customer Order Experience
- `/account/orders/[orderId]` displays shipment carrier, tracking number, safe `https://` tracking link, and `manualRefundRequired` status when applicable, without exposing internal admin notes or actor details.

## RBAC
- `orders.read`: View orders and order details (`SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`, `CUSTOMER_SUPPORT`).
- `orders.update`: Confirm, process, pack, dispatch, deliver, and confirm COD collection (`SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`).
- `orders.cancel`: Cancel eligible orders (`SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`).
