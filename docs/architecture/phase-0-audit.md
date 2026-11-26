# Phase 0 — Design & Repository Audit

## Repository
Empty greenfield project (no package.json, no source, no git). Node 24.19, npm 11.17, psql 17 client.

## Stitch reference (docs/stitch-reference/stitch_horology_luxury_watch_e_commerce/)
Design system md + 14 `code.html` screens (all Tailwind CDN, `darkMode: 'class'`, shared token config).
Components referenced by the design-system doc (`components/*.html`) are NOT in the ZIP; patterns are
taken from the screens themselves.

| # | Screen | Route | Layout |
|---|--------|-------|--------|
| 1 | customer_homepage_desktop | `/` | Storefront (announcement bar, sticky header h-20, footer) |
| 2 | customer_homepage_mobile | `/` (<lg) | Storefront mobile (hamburger, centered logo, 2-col categories, row bestsellers) |
| 3 | product_listing_catalogue | `/products` | Storefront + 256px-ish filter sidebar, 3-col grid, pagination |
| 4 | product_details_page | `/product/[slug]` | Storefront, gallery + sticky buy panel + spec table |
| 5 | shopping_cart | `/cart` | Minimal header (logo, empty-view toggle, theme) |
| 6 | checkout_flow | `/checkout` | Minimal header + stepper, 2 col |
| 7 | customer_authentication | `/auth/signin` | Split screen (dark brand panel / form) |
| 8 | customer_account_order_tracking | `/account` | Storefront header, sidebar nav, tracking stepper |
| 9 | about_contact_faq_policies | `/about`, `/contact`, `/faq`, `/policies/*` | Minimal header, tab pills |
| 10 | admin_dashboard_overview | `/admin/dashboard` | Admin (256px sidebar, top bar, stat cards, bar chart, table) |
| 11 | admin_product_inventory_management | `/admin/products` | Admin |
| 12 | admin_google_sheets_sync | `/admin/google-sheets` | Admin |
| 13 | admin_orders_shipping_gst | `/admin/orders/[id]` | Admin |
| 14 | admin_customers_payments_reports_settings | `/admin/customers` etc. | Admin |

## Tokens (from tailwind-config in each HTML; identical to design-system md)
- Colours `light-*` / `dark-*` prefixed (background, surface, surface-container(-high), on-*, primary, secondary, outline, success, error).
  Implementation: CSS variables on `:root` / `.dark`, exposed as semantic Tailwind colours.
- Radius 2/4/8/12/full; spacing gutter-xs..xl, section 64, page-margin 24.
- Type scale display-lg..mono-sm (Bodoni Moda / Raleway / JetBrains Mono).
- Motion: state-change 180ms, surface-enter 280ms, surface-exit 180ms with given easings; reduced-motion honoured.
- Icons: Material Symbols Outlined.
- Container: `max-w-7xl mx-auto px-6`; header `h-20`.

## Branding replacement
"Aurelia" appears in all 14 files: header logo text, footer, emails (`aureliahorology.in`),
sub-brand names (Aurelia Genève / Marine / Femme), sample coupon `AURELIA10`, order prefix `#AH-`,
sheet name, GSTIN sample, alt texts. All must come from `src/config/brand.ts`
(store name WatchStore). Sub-brands and sample data become seed data, not UI constants.
Sample GSTIN `27AABCA8921F1Z4` and contact details are placeholders only.

## Images
8 unique `lh3.googleusercontent.com/aida/...` URLs (hero watch, chronograph, bronze dress watch,
details, etc.). Several render blank in the supplied PDF (Stitch placeholders), e.g. Abyssal Marine,
Lumière, Solstice, Meridian, About image. Download attempt was not run (network command declined);
pending user approval. Missing images need closely matching replacements per spec.

## Design/business observations to resolve (flagged, not changed)
- Cart totals in Stitch: subtotal 2,33,500 - 10,000 = 2,23,500 with GST "included" 34,093 (18/118 of 2,23,500). Matches GST-inclusive pricing; GST rate must be per-product configurable (design shows flat 18%).
- Admin order GST breakdown shows IGST 0 / CGST+SGST 9% (intra-state); interstate must use IGST by place of supply.
- COD limit ₹50,000 and "per RBI norms" claim, "5-year warranty", "14-day returns", "100% insured transit" are placeholder promises: keep configurable, do not publish unverified.
- Admin sidebar labels differ between screens (e.g. "Orders & GST" vs "Orders, Shipping & GST"); unify into one nav while keeping the visual.
- Stitch ZIP has no mobile layouts except homepage; others derived.

## Phases
0 audit -> 1 foundation (Next 16, Tailwind tokens, fonts, theme, brand config, shells, UI primitives)
-> 2 storefront -> 3 admin -> 4 DB/business logic -> 5 integrations -> 6 QA/security/deploy.

## Milestone 1
Scaffold app; tokens + theme (no flash); brand config; StoreShell, MinimalShell, AuthSplit, AdminShell;
primitives (Button, Badge, Input, Card, Table, IconButton); verify both themes at 1440/390.
