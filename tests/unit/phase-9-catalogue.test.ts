import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/modules/auth/auth", () => ({
  auth: vi.fn(async () => null),
}));

import {
  adminBrandInputSchema,
  adminCategoryInputSchema,
  adminProductInputSchema,
  normalizeSku,
  normalizeSlug,
} from "@/modules/admin/catalogue/catalogue-schemas";
import {
  detectImageMimeType,
  LocalMediaStorageProvider,
  MAX_IMAGE_SIZE_BYTES,
} from "@/modules/admin/catalogue/media-storage";
import { ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";

const validProductBase = {
  name: "Aurelia Chronomaster 40mm",
  slug: "aurelia-chronomaster-40mm",
  sku: "AUR-CHR-901",
  brandId: "b-1",
  categoryIds: ["c-1"],
  gender: "men" as const,
  watchType: "chronograph" as const,
  strapMaterial: "steel" as const,
  dialAndStrap: "Navy Sunray / 316L Steel",
  description: "Precision automatic chronograph with sapphire exhibition caseback.",
  specMovement: "Calibre AH-901 Automatic",
  specCaseDimensions: "40mm x 11.2mm",
  specCrystal: "Sapphire Crystal",
  specWaterResistance: "100m / 10 ATM",
  specHsn: "9102",
  mrpPaise: 16500000,
  pricePaise: 14500000,
  gstRateBps: 1800,
  badge: "new_arrival" as const,
  isBestSeller: false,
  warrantyYears: 5,
  status: "PUBLISHED" as const,
  images: [{ url: "/images/products/chronographs/chronograph_vrn_chr_402_1.webp", alt: "Front" }],
};

describe("Phase 9 — Catalogue Schemas, Media Validation & RBAC", () => {
  it("normalizes slugs and SKUs deterministically", () => {
    expect(normalizeSlug("  Aurelia Heritage 40mm! ")).toBe("aurelia-heritage-40mm");
    expect(normalizeSku(" aur chr 402 ")).toBe("AUR-CHR-402");
  });

  it("validates product pricing, GST, and publication rules", () => {
    expect(adminProductInputSchema.safeParse(validProductBase).success).toBe(true);

    const priceOverMrp = adminProductInputSchema.safeParse({
      ...validProductBase,
      pricePaise: 17000000,
    });
    expect(priceOverMrp.success).toBe(false);

    const negativePrice = adminProductInputSchema.safeParse({
      ...validProductBase,
      pricePaise: -100,
    });
    expect(negativePrice.success).toBe(false);

    const invalidGst = adminProductInputSchema.safeParse({
      ...validProductBase,
      gstRateBps: 3500,
    });
    expect(invalidGst.success).toBe(false);

    const publishedWithoutCategory = adminProductInputSchema.safeParse({
      ...validProductBase,
      categoryIds: [],
      status: "PUBLISHED",
    });
    expect(publishedWithoutCategory.success).toBe(false);

    const draftWithoutCategory = adminProductInputSchema.safeParse({
      ...validProductBase,
      categoryIds: [],
      status: "DRAFT",
    });
    expect(draftWithoutCategory.success).toBe(true);
  });

  it("validates brand and category schemas and rejects path traversal image URLs", () => {
    expect(
      adminBrandInputSchema.safeParse({
        name: "Vireon",
        slug: "vireon",
        description: "Swiss-inspired chronographs",
        logoUrl: "/images/site/site_heritage.webp",
        isActive: true,
      }).success,
    ).toBe(true);

    expect(
      adminCategoryInputSchema.safeParse({
        name: "Dive Watches",
        slug: "dive-watches",
        image: "/images/../secret.txt",
        parentId: null,
        isActive: true,
      }).success,
    ).toBe(false);
  });

  it("detects magic bytes for WebP, JPEG, PNG and rejects spoofed or oversized files", async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const webpHeader = Buffer.from("RIFF1234WEBP", "ascii");
    const fakeSvg = Buffer.from("<svg><script>alert(1)</script></svg>", "utf8");

    expect(detectImageMimeType(pngHeader)).toBe("image/png");
    expect(detectImageMimeType(jpgHeader)).toBe("image/jpeg");
    expect(detectImageMimeType(webpHeader)).toBe("image/webp");
    expect(detectImageMimeType(fakeSvg)).toBeNull();

    const storage = new LocalMediaStorageProvider("/tmp/watchstore-unused-test-dir");
    await expect(storage.saveProductImage({ buffer: Buffer.alloc(0) })).rejects.toThrow(/empty/i);
    await expect(
      storage.saveProductImage({ buffer: Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1) }),
    ).rejects.toThrow(/5 MB/i);
    await expect(storage.saveProductImage({ buffer: fakeSvg })).rejects.toThrow(/Unsupported/i);
  });

  it("assigns Phase 9 brand and publish permissions to CATALOG_MANAGER and restricts non-catalogue roles", () => {
    const catalogPerms = new Set(ADMIN_ROLE_DEFINITIONS.CATALOG_MANAGER.permissions);
    expect(catalogPerms.has("brands.read")).toBe(true);
    expect(catalogPerms.has("brands.manage")).toBe(true);
    expect(catalogPerms.has("catalogue.publish")).toBe(true);

    const orderPerms = new Set(ADMIN_ROLE_DEFINITIONS.ORDER_MANAGER.permissions);
    expect(orderPerms.has("products.create")).toBe(false);
    expect(orderPerms.has("brands.manage")).toBe(false);
    expect(orderPerms.has("catalogue.publish")).toBe(false);
  });
});
