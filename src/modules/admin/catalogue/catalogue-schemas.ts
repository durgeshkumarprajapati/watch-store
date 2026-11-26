import { z } from "zod";

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeSku(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug must be at least 2 characters.")
  .max(100, "Slug must be at most 100 characters.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may contain lowercase letters, numbers, and hyphens only.");

export const skuSchema = z
  .string()
  .trim()
  .min(2, "SKU must be at least 2 characters.")
  .max(40, "SKU must be at most 40 characters.")
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, "SKU may contain uppercase letters, numbers, and hyphens only.");

export const imagePathSchema = z
  .string()
  .trim()
  .min(1, "Image URL is required.")
  .max(500)
  .refine(
    (val) => {
      if (val.includes("..")) return false;
      if (val.startsWith("/images/")) return true;
      try {
        const parsed = new URL(val);
        return parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Image path must start with /images/ or be a valid https:// URL." },
  );

export const productImageInputSchema = z.object({
  url: imagePathSchema,
  alt: z.string().trim().min(1, "Image alt text is required.").max(200),
  provider: z.enum(["local", "cloudinary", "mock"]).optional(),
  publicId: z.string().trim().max(255).nullable().optional(),
});

export const productStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const genderSchema = z.enum(["men", "women", "unisex"]);
export const watchTypeSchema = z.enum(["chronograph", "automatic", "dress", "diver"]);
export const strapMaterialSchema = z.enum(["steel", "leather", "mesh"]);
export const productBadgeSchema = z.enum(["best_seller", "new_arrival", "limited"]);

export const adminProductInputSchema = z
  .object({
    name: z.string().trim().min(2, "Product name is required.").max(160),
    slug: slugSchema,
    sku: skuSchema,
    brandId: z.string().trim().min(1, "Brand is required."),
    categoryIds: z.array(z.string().trim().min(1)).max(20),
    gender: genderSchema,
    watchType: watchTypeSchema,
    strapMaterial: strapMaterialSchema,
    dialAndStrap: z.string().trim().min(2, "Dial and strap summary is required.").max(160),
    description: z.string().trim().min(10, "Description must be at least 10 characters.").max(4000),
    specMovement: z.string().trim().min(2, "Movement specification is required.").max(160),
    specCaseDimensions: z.string().trim().min(2, "Case dimensions are required.").max(160),
    specCrystal: z.string().trim().min(2, "Crystal specification is required.").max(160),
    specWaterResistance: z.string().trim().min(2, "Water resistance is required.").max(160),
    specHsn: z
      .string()
      .trim()
      .regex(/^\d{4,8}$/, "HSN code must be 4 to 8 digits."),
    mrpPaise: z.number().int().positive("MRP must be greater than zero."),
    pricePaise: z.number().int().positive("Selling price must be greater than zero."),
    gstRateBps: z
      .number()
      .int()
      .min(0, "GST rate cannot be negative.")
      .max(2800, "GST rate cannot exceed 28% (2800 bps)."),
    badge: productBadgeSchema.nullable(),
    isBestSeller: z.boolean(),
    warrantyYears: z.number().int().min(0).max(25).nullable(),
    status: productStatusSchema,
    images: z.array(productImageInputSchema).max(10, "Maximum 10 images per product."),
  })
  .refine((data) => data.pricePaise <= data.mrpPaise, {
    message: "Selling price cannot exceed MRP.",
    path: ["pricePaise"],
  })
  .refine(
    (data) => data.status !== "PUBLISHED" || data.categoryIds.length >= 1,
    {
      message: "Published products must belong to at least one category.",
      path: ["categoryIds"],
    },
  );

export type AdminProductInput = z.infer<typeof adminProductInputSchema>;

export const adminBrandInputSchema = z.object({
  name: z.string().trim().min(2, "Brand name is required.").max(100),
  slug: slugSchema,
  description: z.string().trim().max(1000).nullable().optional(),
  logoUrl: imagePathSchema.nullable().optional(),
  logoProvider: z.enum(["local", "cloudinary", "mock"]).optional(),
  logoPublicId: z.string().trim().max(255).nullable().optional(),
  isActive: z.boolean(),
});

export type AdminBrandInput = z.infer<typeof adminBrandInputSchema>;

export const adminCategoryInputSchema = z.object({
  name: z.string().trim().min(2, "Category name is required.").max(100),
  slug: slugSchema,
  image: imagePathSchema.nullable().optional(),
  imageProvider: z.enum(["local", "cloudinary", "mock"]).optional(),
  imagePublicId: z.string().trim().max(255).nullable().optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean(),
});

export type AdminCategoryInput = z.infer<typeof adminCategoryInputSchema>;
