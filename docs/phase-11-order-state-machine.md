# Phase 11 — Order State Machine & Transition Matrix

## Order Status Transitions (`OrderStatus`)

| From | Allowed Next States | Guards & Side Effects |
| --- | --- | --- |
| `PENDING` | `CONFIRMED`, `CANCELLED` | `CONFIRMED` requires `paymentStatus === "PAID"` for `RAZORPAY`; for `COD`, commits active `RESERVED` inventory. |
| `CONFIRMED` | `PROCESSING`, `CANCELLED` | `PROCESSING` via status transition or `markOrderPacked`. |
| `PROCESSING` | `SHIPPED`, `CANCELLED` | `SHIPPED` requires `fulfilmentStatus === "PACKED"`, carrier name, tracking number, and safe `https://` tracking URL. |
| `SHIPPED` | `DELIVERED` | Requires `fulfilmentStatus === "DISPATCHED"`. |
| `DELIVERED` | *(Terminal)* | No further status transitions or cancellations permitted. |
| `CANCELLED` | *(Terminal)* | Releases `RESERVED` inventory; marks `manualRefundRequired = true` for `PAID` Razorpay orders without fabricating `REFUNDED`. |

## Concurrency & Idempotency
Every transition executes inside `prisma.$transaction` with `SELECT ... FROM "Order" WHERE "id" = $1 FOR UPDATE` and `OrderStatusHistory.idempotencyKey` replay protection.
