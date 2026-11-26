/**
 * Idempotent database seed script for WatchStore development catalogue.
 * Preserves all 4 brands, 4 categories, and 12 products with local image paths.
 * Run with: `npm run db:seed`
 */
import { PrismaClient } from "@prisma/client";
import { devBrands, devCategories, devProducts } from "../src/modules/catalogue/seed/dev-catalogue";
import { slugifyBrand } from "../src/modules/catalogue/query";

const prisma = new PrismaClient();

export async function seedCatalogue(client: PrismaClient = prisma) {
  for (const b of devBrands) {
    await client.brand.upsert({
      where: { id: b.id },
      create: { id: b.id, name: b.name, slug: slugifyBrand(b.name) },
      update: { name: b.name, slug: slugifyBrand(b.name) },
    });
  }

  for (const c of devCategories) {
    await client.category.upsert({
      where: { id: c.id },
      create: { id: c.id, slug: c.slug, name: c.name, image: c.image },
      update: { slug: c.slug, name: c.name, image: c.image },
    });
  }

  for (const p of devProducts) {
    await client.product.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        brandId: p.brand.id,
        gender: p.gender,
        watchType: p.watchType,
        strapMaterial: p.strapMaterial,
        dialAndStrap: p.dialAndStrap,
        description: p.description,
        specMovement: p.specs.movement,
        specCaseDimensions: p.specs.caseDimensions,
        specCrystal: p.specs.crystal,
        specWaterResistance: p.specs.waterResistance,
        specHsn: p.specs.hsn,
        mrpPaise: p.mrpPaise,
        pricePaise: p.pricePaise,
        gstRateBps: p.gstRateBps,
        badge: p.badge,
        isBestSeller: p.isBestSeller,
        warrantyYears: p.warrantyYears,
        isActive: true,
        createdAt: new Date(p.createdAt),
      },
      update: {
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        brandId: p.brand.id,
        gender: p.gender,
        watchType: p.watchType,
        strapMaterial: p.strapMaterial,
        dialAndStrap: p.dialAndStrap,
        description: p.description,
        specMovement: p.specs.movement,
        specCaseDimensions: p.specs.caseDimensions,
        specCrystal: p.specs.crystal,
        specWaterResistance: p.specs.waterResistance,
        specHsn: p.specs.hsn,
        mrpPaise: p.mrpPaise,
        pricePaise: p.pricePaise,
        gstRateBps: p.gstRateBps,
        badge: p.badge,
        isBestSeller: p.isBestSeller,
        warrantyYears: p.warrantyYears,
      },
    });

    for (const categoryId of p.categoryIds) {
      await client.productCategory.upsert({
        where: { productId_categoryId: { productId: p.id, categoryId } },
        create: { productId: p.id, categoryId },
        update: {},
      });
    }

    for (let i = 0; i < p.images.length; i++) {
      const url = p.images[i]!;
      await client.productImage.upsert({
        where: { productId_sortOrder: { productId: p.id, sortOrder: i } },
        create: { productId: p.id, url, alt: p.name, sortOrder: i },
        update: { url, alt: p.name },
      });
    }

    await client.productStock.upsert({
      where: { productId: p.id },
      create: {
        productId: p.id,
        available: p.stock.available,
        reserved: p.stock.reserved,
      },
      update: {},
    });
  }
}

export function assertSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production" && env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error(
      "Refusing to run prisma/seed.ts in production without ALLOW_PRODUCTION_SEED=true.",
    );
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"));

if (isDirectRun) {
  assertSeedAllowed();
  seedCatalogue()
    .then(() => {
      console.log(`Seeded ${devBrands.length} brands, ${devCategories.length} categories, ${devProducts.length} products.`);
    })
    .catch((err) => {
      console.error("Database seed failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
