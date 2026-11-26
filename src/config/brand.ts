/**
 * Single source of truth for brand identity.
 * "WatchStore" is a temporary name until the client confirms [CLIENT_BRAND_NAME].
 * Never hardcode the store name in components; import from here.
 */
export const brand = {
  name: "WatchStore",
  /** Upper-case wordmark as shown in headers */
  wordmark: "WATCHSTORE",
  /** Compact wordmark for the mobile header */
  mobileWordmark: "WATCHSTORE",
  shortName: "WatchStore",
  adminLabel: "Admin Console",
  logo: { icon: "schedule", imageSrc: null as string | null },
  favicon: "/favicon.ico",
  title: "WatchStore — Luxury Timepieces",
  titleTemplate: "%s | WatchStore",
  description:
    "Fine mechanical and quartz timepieces, delivered insured across India.",
  tagline: "Fine mechanical and quartz timepieces delivered insured across India.",
  /** PLACEHOLDER claims — shown only when placeholder claims are visible (config/claims.ts). */
  announcement:
    "Complimentary Insured Express Delivery Across India • 5-Year International Movement Warranty",
  announcementShort: "Insured India Delivery • 5-Year Warranty",
  contact: {
    // Placeholders — replace with client details.
    address: "Address line, City, State PIN",
    locations: [] as string[],
    email: "concierge@example.com",
    phone: "+91 00 0000 0000",
  },
  business: {
    legalName: "[LEGAL_NAME]",
    gstin: "[GSTIN]",
    orderPrefix: "WS",
  },
  social: { instagram: "", facebook: "", youtube: "", x: "" },
} as const;

export type Brand = typeof brand;
