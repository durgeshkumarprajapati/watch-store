---
name: "Aurelia Horology — Design System"
description: "Warm editorial luxury watch e-commerce and data-focused admin design system with complete light and dark themes."
---

## Overview

Aurelia Horology is an Indian luxury watch retailer's digital flagship and operations platform. The design system balances editorial horological craft—expressed through high-contrast Didone serif display typography, generous negative space, and warm stone neutrals—with crisp geometric sans-serif clarity for product specifications, pricing, and administrative data tables. Both Light Mode (warm ivory `#F5F2EC` and crisp white `#FFFFFF` with antique bronze `#A87832`) and Dark Mode (deep charcoal `#111315` and slate `#1B1E21` with brushed gold `#D1A65D`) are first-class themes across every storefront page and admin view.

Style: **Modern Editorial Luxury & Minimalism**. Solid, bold surfaces without decorative gradients, glassmorphism, or excessive shadows.

## Colors

The palette pairs warm architectural neutrals with brushed bronze/gold primary accents and deep maritime slate secondary accents. Semantic hues (`success`, `error`) are reserved strictly for status indicators, stock availability, and validation feedback.

- **Primary:** Brushed bronze (`#A87832` light / `#D1A65D` dark) for primary CTAs, active indicators, and key highlights.
- **Secondary:** Deep horological slate (`#172A3A` light / `#344C61` dark) for high-contrast editorial bands, secondary actions, and navigation accents.
- **Surfaces:** Warm alabaster (`#F5F2EC`) and pure white (`#FFFFFF`) in light mode; obsidian charcoal (`#111315`), slate (`#1B1E21`), and elevated graphite (`#24282C`) in dark mode.

```yaml
colors:
  light:
    background: "#F5F2EC"
    on-background: "#171717"
    surface: "#FFFFFF"
    on-surface: "#171717"
    surface-container: "#ECE7DE"
    surface-container-high: "#FFFFFF"
    on-surface-variant: "#68645D"
    primary: "#A87832"
    on-primary: "#171717"
    secondary: "#172A3A"
    on-secondary: "#FFFFFF"
    outline: "#E5DED3"
    success: "#18794E"
    on-success: "#FFFFFF"
    error: "#C43D3D"
    on-error: "#FFFFFF"
  dark:
    background: "#111315"
    on-background: "#F7F5EF"
    surface: "#1B1E21"
    on-surface: "#F7F5EF"
    surface-container: "#202428"
    surface-container-high: "#24282C"
    on-surface-variant: "#B6B6B2"
    primary: "#D1A65D"
    on-primary: "#111315"
    secondary: "#344C61"
    on-secondary: "#F7F5EF"
    outline: "#33383D"
    success: "#42B883"
    on-success: "#111315"
    error: "#F16B6B"
    on-error: "#111315"
```

## Typography

A three-family typographic hierarchy pairs **Bodoni Moda** for editorial display and section headlines, **Raleway** for UI controls, navigation, and body copy, and **JetBrains Mono** for SKUs, GSTIN/HSN codes, prices, and tabular figures.

```yaml
typography:
  display-lg:
    fontFamily: "Bodoni Moda"
    fontSize: 56px
    fontWeight: 600
    lineHeight: 62px
    letterSpacing: -1px
  display-lg-mobile:
    fontFamily: "Bodoni Moda"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 38px
    letterSpacing: -0.5px
  display-md:
    fontFamily: "Bodoni Moda"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 46px
    letterSpacing: -0.5px
  display-md-mobile:
    fontFamily: "Bodoni Moda"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 34px
    letterSpacing: -0.25px
  headline-lg:
    fontFamily: "Bodoni Moda"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 38px
    letterSpacing: -0.25px
  headline-md:
    fontFamily: "Bodoni Moda"
    fontSize: 24px
    fontWeight: 500
    lineHeight: 30px
    letterSpacing: 0px
  title-lg:
    fontFamily: "Raleway"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: 0px
  title-md:
    fontFamily: "Raleway"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: 0.1px
  body-lg:
    fontFamily: "Raleway"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 26px
    letterSpacing: 0px
  body-md:
    fontFamily: "Raleway"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0.1px
  label-lg:
    fontFamily: "Raleway"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 18px
    letterSpacing: 0.5px
  label-sm:
    fontFamily: "Raleway"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.6px
  mono-md:
    fontFamily: "JetBrains Mono"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0px
  mono-sm:
    fontFamily: "JetBrains Mono"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0px
```

## Layout & Spacing

The storefront uses a **12-column Fixed-Max-Width Grid** (`max-w-7xl`, 1280px–1440px) on desktop with `24px`–`48px` outer margins and generous `64px`–`96px` vertical section rhythm. Mobile (`360px`–`390px`) collapses to a 1- or 2-column fluid grid with `16px` outer margins. The Admin Dashboard uses a persistent `256px` left sidebar on desktop that collapses into a slide-over drawer on tablet and mobile, paired with a `16px`–`24px` dense data grid.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 16px
  gutter-lg: 24px
  gutter-xl: 32px
  section: 64px
  page-margin: 24px
```

## Elevation & Depth

Hierarchy relies on **tonal surface contrast** (`background` → `surface` → `surface-container`) and crisp `1px` `outline` borders rather than heavy drop shadows. Subtle ambient shadows (`0 8px 24px -8px rgba(23, 23, 23, 0.08)` in light mode) appear only on product card hover states, dropdown menus, and modal dialogs. Glassmorphism and `backdrop-blur` are prohibited to preserve the solid, tactile horological aesthetic.

## Shapes

Sharp, architectural tailoring with restrained corner rounding: `2px` (`sm`) on badges and editorial buttons, `4px` (`DEFAULT`) on inputs and product cards, `8px` (`md`) on modals and admin stat cards, and `9999px` (`full`) reserved for circular swatch selectors, status dots, and icon buttons.

```yaml
rounded:
  sm: 2px
  DEFAULT: 4px
  md: 8px
  lg: 12px
  full: 9999px
```

## Motion & Micro-interaction

Motion is crisp, deliberate, and mechanical—evoking the sweep of a watch movement. Micro-interactions (`state-change`) complete in `150ms–200ms`; product card image zooms and drawer/modal entrances (`surface-enter`) take `250ms–300ms` with smooth deceleration. Only `transform`, `opacity`, and color properties are animated. All animations respect `prefers-reduced-motion: reduce`.

```yaml
motion:
  state-change:
    duration: 180ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  surface-enter:
    duration: 280ms
    delay: 0ms
    timingFunction: cubic-bezier(0.16, 1, 0.3, 1)
  surface-exit:
    duration: 180ms
    delay: 0ms
    timingFunction: cubic-bezier(0.4, 0, 1, 1)
```

## Voice & Content Strategy

- **Tone of voice:** Refined, assured, and knowledgeable—never hype-driven or generic. Speak to craftsmanship, movement calibre, case finishing, and timeless utility.
- **Capitalisation:** Sentence case for body copy, descriptions, and form labels; Title Case for navigation links and product names; restrained uppercase (`tracking-wider`) only for category eyebrows and micro-labels.
- **Currency & Numbers:** Indian Rupee (`₹`) with Indian numbering format (`₹1,45,000`) in `tabular-nums`, paired with GST-inclusive pricing on storefront and CGST/SGST/IGST breakdowns in admin.
- **Action labels:** Specific verb phrases (`Explore Collection`, `Add to Bag`, `Verify PIN Code`, `Sync Google Sheet`) rather than generic `Submit` or `OK`.

## Components

Component implementations live as individual HTML sticker sheet files in
`components/`. Each file contains the canonical, styled HTML components with
`<!-- COMPONENT: name -->` comment markers. Read each file before use.

- **Badge** → `@components/badge.html` — `badge-numeric`, `badge-dot`
- **Button** → `@components/button.html` — `button-primary`, `button-icon`, `button-with-icon`
- **Card** → `@components/card.html` — `card-elevated`, `card-action`, `card-interactive`, `card-interactive-2`
- **Input Field** → `@components/input-field.html` — `input-field-text`, `input-field-icon`
- **Table** → `@components/table.html` — `table-standard`, `table-interactive`, `table-selectable`
