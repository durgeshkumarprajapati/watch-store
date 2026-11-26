# Phase 13 — Notification Event Catalogue

| Event | Mandatory | Authoritative Trigger | Dedupe Key |
| --- | --- | --- | --- |
| `ORDER_CONFIRMED` | Yes | `markPaymentCapturedInTx` (`Order.status -> CONFIRMED`) | `ORDER_CONFIRMED:<orderId>` |
| `PAYMENT_SUCCESS` | Yes | `markPaymentCapturedInTx` (`Payment.status -> PAID`) | `PAYMENT_SUCCESS:<orderId>` |
| `PAYMENT_FAILED` | Yes | `markPaymentFailedInTx` (`Payment.status -> FAILED`) | `PAYMENT_FAILED:<paymentId>:<attemptOrPayId>` |
| `COD_ORDER_CONFIRMED` | Yes | `transitionAdminOrderStatus` (`COD`, `CONFIRMED`) | `COD_ORDER_CONFIRMED:<orderId>` |
| `SHIPMENT_CREATED` | No | `createShiprocketShipment` | `SHIPMENT_CREATED:<shipmentId>` |
| `SHIPMENT_DISPATCHED` | No | `dispatchAdminOrder` / `createManualShipmentRecord` / `applyTrackingUpdateInTx` | `SHIPMENT_DISPATCHED:<orderId>` |
| `OUT_FOR_DELIVERY` | No | `applyTrackingUpdateInTx` (`OUT_FOR_DELIVERY`) | `OUT_FOR_DELIVERY:<orderId>` |
| `ORDER_DELIVERED` | No | `transitionAdminOrderStatus` / `applyTrackingUpdateInTx` (`DELIVERED`) | `ORDER_DELIVERED:<orderId>` |
| `ORDER_CANCELLED` | Yes | `cancelAdminOrder` (`Order.status -> CANCELLED`) | `ORDER_CANCELLED:<orderId>` |
