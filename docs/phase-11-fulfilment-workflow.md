# Phase 11 — Fulfilment & Manual Shipment Workflow

1. **Confirmation**: Razorpay orders are confirmed automatically on authoritative payment capture (`markPaymentCapturedInTx`). COD orders are confirmed by an authorized administrator (`PENDING -> CONFIRMED`), committing reserved stock.
2. **Packing**: `markOrderPacked` moves `fulfilmentStatus` from `AWAITING_PACKING` to `PACKED` (`Order.status = PROCESSING`) and records `packedAt` and `packedByAdminId`.
3. **Manual Dispatch**: `dispatchAdminOrder` requires `PROCESSING / PACKED`, records manual `carrierName`, `trackingNumber`, optional `https://` `trackingUrl`, `shipmentReference`, and `shippingNotes`, and advances to `SHIPPED / DISPATCHED`.
4. **Delivery & COD Collection**: Marking `DELIVERED` completes fulfilment. COD payment status remains `PENDING` until explicitly confirmed via `confirmCodPaymentCollected`.
