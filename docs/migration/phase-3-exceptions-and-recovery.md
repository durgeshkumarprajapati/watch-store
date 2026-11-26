# Phase 3F & 3G — Exceptions and Recovery Report

## 1. Migration Execution Exceptions

- **Execution Failures:** `0`
- **Rolled-Back Batches:** `0`
- **Recovery Actions Needed:** None.

---

## 2. Intentionally Skipped / Preserved Records

1. **`Customer` (`durgeshpardypanda@gmail.com`):** `1` local row (`cmww1yuth0001wgj6kjet4706`) skipped because Supabase already had `cmwx702dz0004wgu14bfo1fy0` for the same email. All dependent `Order` (`2`) and `Notification` (`6`) foreign keys were remapped to `cmwx702dz0004wgu14bfo1fy0`.
2. **`AuthActionToken` (`1` row):** Local `EMAIL_VERIFICATION` token for `durgeshpardypanda@gmail.com` skipped; Supabase's existing `AuthActionToken` (`cmwx6nld60002wgu1z7von8h8`) was preserved.
3. **`ShiprocketAuthToken` (`1` row):** Local expired `1970-01-01T05:30:00.000Z` placeholder token was intentionally skipped; Shiprocket will fetch a fresh token on first live API call.
4. **`_prisma_migrations` (`13` rows):** Excluded; destination already had identical migration history.

---

## 3. Observations & Remaining Risks

1. **Port `6543` Transaction Pooler Concurrency Note:** During Phase 3G smoke testing, an initial `Promise.all` burst of `6` concurrent Prisma queries against `aws-1-ap-southeast-2.pooler.supabase.com:6543` returned `Can't reach database server at aws-1-ap-southeast-2.pooler.supabase.com:6543`, whereas sequential queries on `6543` and all Next.js HTTP routes succeeded cleanly. Monitor connection pooling (`connection_limit`) under concurrent production load.
2. **Seeded `ProductStock.reserved` Values:** The `7` seeded `reserved > 0` values (`p-001`, `p-002`, `p-005`, `p-007`, `p-008`, `p-009`, `p-011`) were preserved verbatim per Phase 3B approval.
3. **Authenticated UI Smoke Tests:** Interactive customer/admin login flows were not executed to avoid modifying session/token state during a read-only verification phase.
