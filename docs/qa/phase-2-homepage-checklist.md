# Phase 2 — Homepage visual QA

Status: **NOT VERIFIED.** Implemented from the Stitch HTML; no screenshot has been compared yet.
Run `npm run qa:build && npm run qa:start`, open http://localhost:3000.
References: desktop = PDF p1 (+ `customer_homepage_desktop/code.html`), mobile = PDF p7 (+ `customer_homepage_mobile/code.html`).
Expected for now: all images are placeholders (no photos committed). Compare layout, not photography.

Screenshots: `home_1440_light`, `home_1440_dark`, `home_390_light`, `home_390_dark` (+ 768 and 360 spot checks).

## Layout
- [ ] Desktop: announcement bar, 80px header w/ nav + 5 icons, hero 2-col (text left, image right, min 600px), categories 4-col, best sellers 4-col w/ tabs, heritage 2-col, newsletter band, 4-col footer
- [ ] Mobile: short announcement, 64px header (menu | centered wordmark | theme, cart), hero image ON TOP then text, full-width stacked buttons, categories 2-col (first two only below 640px), best sellers as horizontal rows with "ADD", simple centred footer
- [ ] Hero stays dark in BOTH themes; secondary button mobile = outlined, desktop = secondary fill
- [ ] Category card: square image; count + arrow hidden on mobile
- [ ] Product card: 4:5 image, badge top-left, heart top-right, brand label, title, price + struck MRP + green "% OFF", Add to Bag + eye button
- [ ] Section spacing 64px desktop / 32px mobile; max width 1280, 24px gutters (16px mobile)
## Tokens
- [ ] Fonts: Bodoni Moda headings, Raleway UI, JetBrains Mono only for mono items; prices tabular
- [ ] Light/dark colours per design system; no leftover light surfaces in dark mode
## Interaction (functional, not just visual)
- [ ] Add to Bag: button shows Adding… then Added ✓; header badge count updates; persists on reload; sold-out product disabled
- [ ] Heart toggles and persists on reload
- [ ] Best sellers tabs (All / Men's / Women's) change the list via ?best=; URL shareable; no scroll jump
- [ ] Mobile menu opens/closes (button, Esc, link click); body scroll locked while open
- [ ] Newsletter: invalid email shows error; valid email shows success; duplicate says already subscribed
- [ ] Card hover lift + image zoom (~280ms); reduced-motion respected
- [ ] No horizontal scroll at 390/360

## Known intentional differences (not bugs)
- Brand/product/sub-brand names are neutral fictional dev data; category counts come from the seed (not 18/24/12/16)
- Mobile Stitch omits heritage + newsletter; they are shown stacked on mobile for content parity
- Nav links to /products, /product/[slug], /about, /account, /cart pages that are not built yet (404 until their step)
- Images absent: see public/images/README.md
- Unverified claims (warranty, insured delivery, heritage stats, "18,000+") shown only because qa:start sets SHOW_PLACEHOLDER_CLAIMS

Sign-off: ____ Date: ____ Findings: docs/qa/phase-2-homepage-findings.md
