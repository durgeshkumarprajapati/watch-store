# Phase 1 visual QA — screenshot checklist

Status: **NOT YET VERIFIED.** No item below is marked passed until the screenshot has been compared
against the Stitch reference (PDF page / `docs/stitch-reference/.../code.html`).
Phase 1 pages are shells with placeholder content: compare shell chrome (header, footer, sidebar, top bar,
tokens, fonts), not page body content.

Serve: `npm run qa:build && npm run qa:start` -> http://localhost:3000
Dark mode: click the theme toggle (also test OS "system" preference with a fresh profile / cleared localStorage key `theme`).
Capture full-page screenshots, name files `<route>_<viewport>_<theme>.png`.

Viewports: Desktop 1440x900 | Mobile 390x844 (also spot-check 360 wide and 768 tablet)

| # | Route | Reference | Desktop L | Desktop D | Mobile L | Mobile D | Result |
|---|-------|-----------|-----------|-----------|----------|----------|--------|
| 1 | `/` storefront shell | PDF p1 (desktop), p7 (mobile) | [ ] | [ ] | [ ] | [ ] | pending |
| 2 | `/cart` minimal shell | PDF p4 | [ ] | [ ] | [ ] | [ ] | pending |
| 3 | `/auth/signin` split shell | PDF p8 | [ ] | [ ] | [ ] | [ ] | pending |
| 4 | `/admin/dashboard` admin shell | PDF p6 | [ ] | [ ] | [ ] | [ ] | pending |

## What to check on each screenshot
Shell / tokens
- [ ] Announcement bar: secondary colour, 11px uppercase tracked label
- [ ] Header height 80px, sticky, 1px outline border, wordmark in Bodoni Moda, icon colour = primary
- [ ] Nav: Raleway 13px uppercase, active item has 2px primary underline (desktop only, hidden < lg)
- [ ] Header icons 40px circles; cart badge shown only if count > 0 (Stitch sample shows "2"; not wired yet)
- [ ] Footer: 4 columns on md+, stacked on mobile; contact lines in JetBrains Mono
- [ ] Background light #F5F2EC / dark #111315; surfaces white / #1B1E21; outline colours per spec
- [ ] Fonts actually load: Bodoni Moda (headings), Raleway (UI), JetBrains Mono (codes); no fallback serif/sans
- [ ] Material Symbols icons render as glyphs, not text such as "search"/"dark_mode"
- [ ] Theme toggle switches, persists on reload, no flash of wrong theme on reload
- [ ] No horizontal scroll at 390 and 360 widths
Admin
- [ ] Sidebar 256px, active item primary background, Settings pinned at bottom
- [ ] Top bar 80px with breadcrumb, search (md+), theme toggle, notification dot, avatar
- [ ] < lg: sidebar hidden, hamburger opens slide-over drawer, overlay click closes
Auth
- [ ] Left dark band panel (dark in BOTH themes, lg+ only); right form panel follows theme
Known intentional differences in Phase 1 (not bugs)
- Brand text reads "WATCHSTORE"; copy/contact/footer text uses config placeholders
- Homepage body, cart body, sign-in form, dashboard body are placeholders until Phase 2/3
- Product images are not wired yet

## Sign-off
Reviewer: ____  Date: ____  Mismatches logged in: docs/qa/phase-1-findings.md (create when needed)
