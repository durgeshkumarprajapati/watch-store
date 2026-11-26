/**
 * Homepage editorial copy. PLACEHOLDER text adapted from the Stitch sample —
 * all of it needs client approval. Anything that makes a factual promise sits
 * under `claims` and is hidden in hosted production (see config/claims.ts).
 */
export const homeContent = {
  hero: {
    eyebrow: "Geneva Calibre • Crafted for India",
    title: "TIMELESS STYLE. BUILT FOR EVERY MOMENT.",
    body: "Precision mechanical chronographs, ultra-thin dress watches, and sapphire-crystal diver instruments—curated for collectors who value enduring horological craft.",
    bodyMobile: "Precision mechanical chronographs and minimal dress watches delivered insured across India.",
    primaryCta: { label: "Explore Collection", href: "/products" },
    secondaryCta: { label: "Discover New Arrivals", href: "/products?sort=new" },
  },
  categories: { eyebrow: "Curated Silhouettes", title: "Shop by Category", viewAll: { label: "View Full Catalogue", href: "/products" } },
  bestSellers: { eyebrow: "Collector Favourites", title: "Best Sellers" },
  newsletter: {
    eyebrow: "Private Collectors Circle",
    title: "Receive Early Access to Limited Editions",
    body: "Private launch invitations, horology journal essays, and complimentary strap care kits.",
    placeholder: "Enter your email address",
    cta: "Subscribe",
  },
  claims: {
    newsletterBody:
      "Join 18,000+ Indian collectors for private launch invitations, horology journal essays, and complimentary strap care kits.",
    heritage: {
      eyebrow: "Our Horological Heritage",
      title: "Crafted for Precision. Inspected in Mumbai & Geneva.",
      body: "Every timepiece in our collection undergoes a 72-hour chronometric regulation check before dispatch. From hand-stitched full-grain Italian calfskin to anti-reflective sapphire crystals, we partner directly with independent ateliers to deliver heirloom quality without traditional retail markups.",
      stats: [
        { value: "5 Years", label: "Calibre Warranty" },
        { value: "100%", label: "Insured Transit" },
        { value: "14 Days", label: "Easy Returns" },
      ],
    },
  },
} as const;
