import type { OrderStatus, PaymentStatus } from "@prisma/client";

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ["REQUIRES_GATEWAY", "AUTHORIZED", "PAID", "FAILED"],
  REQUIRES_GATEWAY: ["AUTHORIZED", "PAID", "FAILED"],
  AUTHORIZED: ["PAID", "FAILED", "REFUNDED"],
  PAID: ["REFUNDED"],
  FAILED: ["REQUIRES_GATEWAY"],
  REFUNDED: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionPaymentStatus(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}
