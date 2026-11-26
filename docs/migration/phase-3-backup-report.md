# Phase 3A — Pre-Migration Backup Report

**Backup Date:** 2026-11-26  
**Storage Location:** `/home/ppsd-021/watchstore-backups/` (`0700` permissions, outside the Git repository)

---

## 1. Backup Artifacts & Integrity Checksums

Both backups were created with `pg_dump --format=custom --no-owner --no-privileges` (preserving schema, data, sequences, indexes, and constraints) without exposing credentials:

| Target | Backup File | Timestamp (UTC) | Size (Bytes) | TOC Entries | SHA-256 Checksum |
| :--- | :--- | :--- | ---: | ---: | :--- |
| **Local `watchstore_db`** | `/home/ppsd-021/watchstore-backups/watchstore_local_20261126065439.dump` | `2026-11-26T06:54:39Z` | `164,735` | `288` | `2ed6b76623ee0c1a7159976a6be851d1eb3d72ec6c152c7eb0ec6fe691df7070` |
| **Supabase `oovkkzetdjiphjumponn` (`public`)** | `/home/ppsd-021/watchstore-backups/watchstore_supabase_20261126065439.dump` | `2026-11-26T06:54:39Z` | `132,966` | `332` | `bfdd3c3e1240d154135ebad6927a4f3899afa42a1862945d289b78e51bbfd1ef` |

---

## 2. Test Restoration Verification

Both dumps were restored into an isolated, ephemeral PostgreSQL `16.14` cluster (`/home/ppsd-021/watchstore-backups/tmp-pg16-restore-test`, port `55432`) using `/usr/lib/postgresql/17/bin/pg_restore` and verified with SQL table/row counts before tearing down the temporary cluster:

| Restored Test DB | Tables (`public`) | Migrations (`_prisma_migrations`) | Application Rows (excl. `_prisma_migrations`) | Notes |
| :--- | ---: | ---: | ---: | :--- |
| `restore_local_test` | `42` | `13` | `854` | Exact match to local `watchstore_db`. Only non-fatal `SET transaction_timeout = 0;` ignored on PG 16. |
| `restore_supa_test` | `42` | `13` | `153` | Exact match to Supabase (`152` initial + `1` `Customer` row `cmwx702dz0004wgu14bfo1fy0` created prior to backup). |

**Result:** **PASS** — Both pre-migration backups are verified, restorable, and stored safely outside the repository.
