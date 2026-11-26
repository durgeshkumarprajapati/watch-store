# Phase 3B — Reserved Inventory Discrepancy Resolution

**Investigated Products:** `p-001`, `p-002`, `p-005`, `p-007`, `p-008`, `p-009`, `p-011`

---

## 1. Investigation Findings

Inspection of `src/modules/catalogue/seed/dev-catalogue.ts`, `prisma/seed.ts`, `ProductStock`, `InventoryReservation`, `StockAdjustment`, and `OrderItem` in `watchstore_db` established the exact origin of the discrepancy:

1. **Seed Fixture Origin (`dev-catalogue.ts` + `prisma/seed.ts`):**
   - `src/modules/catalogue/seed/dev-catalogue.ts` explicitly defines initial `stock.reserved > 0` values for these 7 products (`p-001`: 3, `p-002`: 1, `p-005`: 2, `p-007`: 2, `p-008`: 1, `p-009`: 2, `p-011`: 1; plus `p-004`: 1, which was later consumed when a test order committed).
   - `prisma/seed.ts` (line 103) writes `reserved: p.stock.reserved` directly into `ProductStock` without creating `InventoryReservation` records.
2. **Operational History for `p-011`:**
   - One test order (`cmwvvi3o50002wgdlpp6a8lep`) created a `RESERVATION` adjustment (`deltaAvailable: -1, deltaReserved: +1`), which subsequently expired (`EXPIRATION`, `deltaAvailable: +1, deltaReserved: -1`), returning `p-011` to its seeded `reserved: 1`.
   - None of the other 6 products (`p-001`, `p-002`, `p-005`, `p-007`, `p-008`, `p-009`) have any `InventoryReservation` or `StockAdjustment` records.

| `productId` | `sku` | Seeded `reserved` | Current `available` | Current `reserved` | Active `RESERVED` Sum |
| :--- | :--- | ---: | ---: | ---: | ---: |
| `p-001` | `VRN-CHR-402` | 3 | 18 | 3 | 0 |
| `p-002` | `ORR-DRS-118` | 1 | 12 | 1 | 0 |
| `p-005` | `ORR-DRS-094` | 2 | 25 | 2 | 0 |
| `p-007` | `VRN-CHR-417` | 2 | 14 | 2 | 0 |
| `p-008` | `VRN-CHR-431` | 1 | 5 | 1 | 0 |
| `p-009` | `VRM-DIV-206` | 2 | 16 | 2 | 0 |
| `p-011` | `VRF-FEM-128` | 1 | 11 | 1 | 0 |

---

## 2. Chosen Migration Treatment

- **Preserve Source Data Verbatim:** In accordance with Phase 3B rules ("Do not silently reset, adjust or discard these values. Preserve the source data and document the chosen migration treatment"), `ProductStock.available` and `ProductStock.reserved` will be migrated **as-is** to Supabase without mutation.
- **No Corruption:** These values reflect intentional seeded demo stock fixtures rather than lost or orphaned live reservations.
