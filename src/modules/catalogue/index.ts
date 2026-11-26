import "server-only";
import { hasDatabaseUrl } from "@/config/env";
import { seedDataAllowed } from "@/config/data-source";
import type { ProductRepository } from "./product-repository";
import { prismaProductRepository } from "./prisma/prisma-product-repository";
import { seedProductRepository } from "./seed/seed-product-repository";

export function getProductRepository(): ProductRepository {
  if (process.env.CATALOGUE_SOURCE === "seed") return seedProductRepository;
  if (hasDatabaseUrl()) return prismaProductRepository;
  if (seedDataAllowed()) return seedProductRepository;
  throw new Error(
    "No production catalogue configured: set DATABASE_URL to connect to PostgreSQL.",
  );
}

export * from "./types";
export { toSummary, discountPercent, availabilityOf } from "./summary";
