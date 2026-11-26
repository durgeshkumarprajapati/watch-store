# Phase 2 plan — storefront (prepared, NOT started)

Gate: Phase 1 visual QA must be signed off from real screenshots first (docs/qa/phase-1-screenshot-checklist.md).
Source of truth: Stitch HTML + design system. No new visual direction.

## Cleanup carried from the audit
- [x] Hero / sign-in hardcoded hex colours replaced by "band" tokens (`bg-band`, `text-on-band`, `text-band-primary`, ...). No hex values remain in components (only in globals.css tokens).
- [ ] Any new always-dark area must use band tokens; no new hardcoded colours.
- [ ] Admin stays marked UNPROTECTED (src/config/security.ts) until auth/RBAC work lands.

## Data approach (DB is Phase 4)
Define typed domain models and a `ProductRepository`-style interface now; back it with seed data in
dev only so pages are real (filtering, sorting, pagination, cart maths run server-side) and the
Prisma implementation drops in later without UI changes. Money in integer paise. Never trust client prices.

## Order of work
1. Homepage (desktop + dedicated mobile layout): hero, categories, best sellers (tabs), heritage, newsletter, footer
2. Catalogue: server-side filters/sort/search/price range/pagination via URL params
3. Product detail: gallery with zoom, specs, qty, PIN check (stubbed serviceability), related
4. Cart: guest cart (cookie), server-priced totals, coupon, empty state, merge-on-login hook
5. Checkout: stepper, address, shipping, payment selection (Razorpay/COD wiring in Phase 5), server totals
6. Auth (Auth.js Google) UI, account + order tracking, about/contact/FAQ/policy pages (editable content config)

## Image assets
Stitch images are googleusercontent URLs (network blocked in the sandbox). Need local files; several
products have no image in the export. User to supply photos or approve a source.
