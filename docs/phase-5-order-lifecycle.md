# Phase 5 — Order & Payment Lifecycle

Source: [`src/modules/checkout/status-transitions.ts`](../src/modules/checkout/status-transitions.ts) & [`src/modules/checkout/persistent-order-service.ts`](../src/modules/checkout/persistent-order-service.ts)

## Separation of Concerns
Order fulfillment status (`OrderStatus`) and payment settlement status (`PaymentStatus`) are tracked independently.

## Order Status Transitions (`OrderStatus`)
| From | Allowed Next States |
|---|---|
| `PENDING` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `PROCESSING`, `CANCELLED` |
| `PROCESSING` | `SHIPPED`, `CANCELLED` |
| `SHIPPED` | `DELIVERED` |
| `DELIVERED` | *(terminal)* |
| `CANCELLED` | *(terminal)* |

## Payment Status Transitions (`PaymentStatus`)
| From | Allowed Next States |
|---|---|
| `PENDING` | `REQUIRES_GATEWAY`, `AUTHORIZED`, `PAID`, `FAILED` |
| `REQUIRES_GATEWAY` | `AUTHORIZED`, `PAID`, `FAILED` |
| `AUTHORIZED` | `PAID`, `FAILED`, `REFUNDED` |
| `PAID` | `REFUNDED` |
| `FAILED` | `REQUIRES_GATEWAY` |
| `REFUNDED` | *(terminal)* |

## Checkout Boundary
- **COD (`<= ₹50,000`)**: Creates `Order` (`PENDING`), `Payment` (`COD`, `PENDING`), and `InventoryReservation` (`RESERVED`).
- **Razorpay**: Creates `Order` (`PENDING`), `Payment` (`RAZORPAY`, `REQUIRES_GATEWAY`), and `InventoryReservation` (`RESERVED`). Live Razorpay API calls and webhook verification are deferred to Phase 6.
- **Cart Clearing**: Cart and promo cookies are cleared **only after** the database transaction commits.
