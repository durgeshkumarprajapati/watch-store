# Phase 2 — Database Comparison (`watchstore_db` vs Supabase `oovkkzetdjiphjumponn`)

**Audit Date:** 2026-11-26  
**Scope:** Strictly read-only schema and environment comparison between local PostgreSQL (`watchstore_db`) and Supabase PostgreSQL (`oovkkzetdjiphjumponn`, region `ap-southeast-2`).

---

## 1. Executive Summary

| Dimension | Local (`watchstore_db`) | Supabase (`oovkkzetdjiphjumponn`) | Match Status |
| :--- | :--- | :--- | :--- |
| **PostgreSQL Engine** | PostgreSQL `16.14` (`x86_64-pc-linux-gnu`) | PostgreSQL `17.6` (`aarch64-unknown-linux-gnu`) | Minor version upgrade (`16.14` → `17.6`), fully compatible |
| **Prisma Migrations** | `13` applied (`0001_init` – `0013_phase16_operations`) | `13` applied (`0001_init` – `0013_phase16_operations`) | **EXACT MATCH** (all 13 checksums & step counts identical) |
| **Tables (`public`)** | `42` (`41` app tables + `_prisma_migrations`) | `42` (`41` app tables + `_prisma_migrations`) | **EXACT MATCH** |
| **Columns & Types** | Identical across all `42` tables | Identical across all `42` tables | **EXACT MATCH** |
| **Enums (`public`)** | `23` enum types | `23` enum types | **EXACT MATCH** |
| **Primary Keys, FKs, Unique Constraints** | Identical | Identical | **EXACT MATCH** |
| **Indexes (`public`)** | Identical | Identical | **EXACT MATCH** |
| **CHECK (`NOT NULL`) Constraints** | `307` PG16-named `CHECK` entries | `307` PG17-named `<table>_<col>_not_null` entries | Expected PG 16 vs PG 17 `information_schema` difference only |
| **Triggers (`public`)** | `0` | `0` | **EXACT MATCH** |
| **Functions (`public`)** | `0` | `1` (`rls_auto_enable()`) | Supabase platform helper function |
| **Extensions** | `plpgsql` (`1.0`) | `plpgsql` (`1.0`), `pg_stat_statements` (`1.11`), `pgcrypto` (`1.3`), `supabase_vault` (`0.3.1`), `uuid-ossp` (`1.1`) | Supabase managed extensions in `extensions` / `vault` schemas |
| **Schema Drift** | None | None | **COMPATIBLE (ZERO DRIFT)** |

---

## 2. Prisma Migration History & Checksums

All 13 migrations in `_prisma_migrations` have `applied_steps_count = 1`, `rolled_back_at = NULL`, and identical SHA-256 checksums on both databases:

| # | Migration Name | Checksum Prefix | Steps | Local vs Supabase |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `0001_init` | `f3c7df0b6e26` | 1 | Identical |
| 2 | `0002_phase6_razorpay_payments` | `b48a38ce302e` | 1 | Identical |
| 3 | `0003_phase7_customer_auth` | `f81eee88466c` | 1 | Identical |
| 4 | `0004_phase8_admin_rbac` | `7e86ea80a961` | 1 | Identical |
| 5 | `0005_phase9_admin_catalogue` | `127395dbbd18` | 1 | Identical |
| 6 | `0006_phase10_admin_inventory` | `34715069fa96` | 1 | Identical |
| 7 | `0007_phase11_admin_orders` | `c0278ba15232` | 1 | Identical |
| 8 | `0008_phase12_shiprocket_shipping` | `332c540455b1` | 1 | Identical |
| 9 | `0009_phase13_notifications` | `552bfa7a8b9c` | 1 | Identical |
| 10 | `0010_phase14_google_sheets_sync` | `557ed8f027fa` | 1 | Identical |
| 11 | `0011_phase15_cloudinary_media` | `fa90f3df2d89` | 1 | Identical |
| 12 | `0012_phase15_media_durability` | `43f2d6d760e9` | 1 | Identical |
| 13 | `0013_phase16_operations` | `89ffa991d994` | 1 | Identical |

---

## 3. Schema Compatibility Findings

1. **Zero Schema Drift:** Zero missing tables, zero unexpected tables, zero column/type/nullability/default differences, zero enum differences, zero PK/FK/unique constraint differences, and zero index differences.
2. **PostgreSQL 16 vs 17 `NOT NULL` Constraint Naming:** The `307` `CHECK` constraint differences reported by `information_schema.table_constraints` are purely due to PostgreSQL 17 exposing explicit `NOT NULL` constraint names (`<table>_<column>_not_null`), whereas PostgreSQL 16 uses internal OID-based names (`<oid>_<attnum>_not_null`). Column `is_nullable` definitions are 100% identical.
3. **Supabase Platform Objects:** Supabase includes managed extensions (`pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`) in `extensions`/`vault` schemas and `public.rls_auto_enable()`. None interfere with Prisma or application tables.
4. **Conclusion:** The schemas are **100% compatible** for direct data migration without modifying or reapplying any Prisma migrations.
