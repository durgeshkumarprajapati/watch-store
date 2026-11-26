# Phase 5 — Database Architecture Plan

## Overview
Phase 5 integrates **PostgreSQL** and **Prisma ORM (`6.19.3`)** into WatchStore's modular monolithic architecture while preserving all Phase 1–4 storefront flows and visual design.

## Architecture Layers
- **Catalogue**: `Page / Server Component` → `getProductRepository()` (`src/modules/catalogue/index.ts`) → `prismaProductRepository` (when `DATABASE_URL` is configured) or `seedProductRepository` (only when `CATALOGUE_SOURCE=seed` or non-production without `DATABASE_URL`). Production fails loudly if `DATABASE_URL` is absent.
- **Checkout & Orders**: `CheckoutView` → `submitCheckoutAction` (`src/modules/checkout/actions.ts`) → `createPersistentOrder` (`src/modules/checkout/persistent-order-service.ts`) → `PrismaClient.$transaction` (Order + OrderItems + OrderAddressSnapshot + OrderStatusHistory + Payment + InventoryReservation).
- **Inventory**: Atomic conditional updates (`ProductStock.available >= quantity`) inside the checkout transaction prevent negative stock under concurrent requests.

## Monetary Representation
All monetary values (MRP, selling price, discounts, GST, shipping, grand total) are stored as **integer paise** (`Int`, 1 INR = 100 paise) and GST rates as **basis points** (`1800` = 18%), eliminating floating-point rounding drift.
