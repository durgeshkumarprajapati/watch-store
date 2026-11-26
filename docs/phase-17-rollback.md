# Phase 17 — Rollback Strategy

1. **Application Rollback (Vercel)**: Promote the previous known-good Vercel deployment immediately via Vercel Dashboard / CLI.
2. **Database Compatibility**: Because all WatchStore migrations (`0001`–`0013`) are strictly additive, the previous application deployment remains schema-compatible with newly added nullable columns/tables.
3. **Forward-Fix Rule**: A Vercel rollback does **not** roll back PostgreSQL migrations. Never run destructive `DOWN` SQL against production; issue an additive forward-fix migration if schema adjustment is needed.
