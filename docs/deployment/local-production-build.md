# Running the production build locally

## Requirements
- Node.js >= 20.9 (developed on 24.19), npm >= 10
- Internet access ONLY for `npm install` (fonts are self-hosted; no Google Fonts call at build or run time)
- Port 3000 free (change with `-p` in the `qa:start` script if needed)
- No database or API keys are needed yet (Phase 1; pages are static/placeholder)

## Commands (from the project root)
```bash
npm install
npm run clean        # removes .next and .next-build (safe, idempotent)
npm run qa:build     # builds into .next-build
npm run qa:start     # serves on http://localhost:3000 (admin preview enabled, see below)
```
Optional checks before screenshots: `npm run typecheck && npm run lint`.

Standard Next commands also work: `npm run build` (-> `.next`) and `npm start`.
For production-like admin behaviour use `npm start` WITHOUT the preview flag; `/admin/*` then returns 404.

## `NEXT_DIST_DIR` and the `.next` directory
- `next.config.ts` reads `NEXT_DIST_DIR` (default `.next`). `qa:build`/`qa:start` set it to `.next-build`
  so QA builds never collide with dev/regular builds.
- Why it exists: a stale `.next` Turbopack cache kept failing builds with an error about a file that no
  longer existed. The fix is to build into a fresh directory, or run `npm run clean`.
- Rules:
  1. A build and the `start` that serves it MUST use the same `NEXT_DIST_DIR` value. Mixing them gives
     "Could not find a production build" errors.
  2. If a build fails strangely after you changed fonts/CSS imports, run `npm run clean` and rebuild.
  3. `.next` and `.next-build` are git-ignored and excluded from ESLint. Never commit them.
  4. Do not run `npm run dev` and `qa:start` at the same time on the same port.

## Preview flags used by `qa:start` (local QA only — never set on a hosted environment)
See `.env.example` for the full list of optional local QA environment variables (no external API credentials are required for Phases 1–3).

| Variable | Effect |
|----------|--------|
| `CATALOGUE_SOURCE=seed` | allows the fictional development catalogue in a production build (otherwise the storefront throws: no DB repository until Phase 4) |
| `SHOW_PLACEHOLDER_CLAIMS=true` | shows unverified Stitch sample claims (warranty, insured transit, announcement bar, heritage section) so screens can be compared to the design; hidden otherwise |
| `ALLOW_UNPROTECTED_ADMIN_PREVIEW=true` | lets `/admin/*` render in a production build (no auth yet) |
Cart and wishlist use httpOnly cookies; newsletter signups are written to `.data/` (git-ignored, dev only).

## Admin routes are UNPROTECTED
There is no authentication or role check yet. `src/config/security.ts` holds
`ADMIN_AUTH_IMPLEMENTED = false`. While false:
- development (`npm run dev`): admin accessible
- production: `/admin/*` is 404 unless `ALLOW_UNPROTECTED_ADMIN_PREVIEW=true` (only set by `qa:start`)
Admin must not be deployed or treated as production-ready until server-side auth + RBAC are implemented
and tested (Phase 4/5). Never set the preview variable on a hosted environment.
