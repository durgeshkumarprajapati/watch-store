import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, ProductStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { discountPercent } from "@/modules/catalogue/summary";
import { recordAdminAuditLog } from "../admin-audit-service";
import type { AuthenticatedAdmin } from "../admin-auth-service";
import { hasAdminPermission } from "../rbac-catalogue";
import { revalidateCataloguePaths } from "./catalogue-revalidation";
import { buildSafeCloudinaryFolder } from "./cloudinary-media-storage";
import {
  getMediaStorageProvider,
  type MediaStorageProvider,
} from "./media-storage";
import {
  isMediaAssetReferenced,
  scheduleAndAttemptMediaCleanup,
} from "./media-cleanup-service";
import {
  adminProductInputSchema,
  normalizeSku,
  normalizeSlug,
  type AdminProductInput,
} from "./catalogue-schemas";

export type AdminProductSort = "updated-desc" | "created-desc" | "name-asc" | "price-asc" | "price-desc";

export interface AdminProductListQuery {
  q?: string;
  brandId?: string;
  categoryId?: string;
  status?: ProductStatus;
  sort?: AdminProductSort;
  page?: number;
  pageSize?: number;
}

export interface AdminProductListItem {
  id: string;
  slug: string;
  sku: string;
  name: string;
  brandName: string;
  brandId: string;
  categories: { id: string; name: string }[];
  mrpPaise: number;
  pricePaise: number;
  discountPercent: number;
  gstRateBps: number;
  specHsn: string;
  status: ProductStatus;
  isActive: boolean;
  isBestSeller: boolean;
  imageUrl: string | null;
  stockAvailable: number;
  stockReserved: number;
  updatedAt: string;
}

export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  sku: string;
  brandId: string;
  categoryIds: string[];
  gender: "men" | "women" | "unisex";
  watchType: "chronograph" | "automatic" | "dress" | "diver";
  strapMaterial: "steel" | "leather" | "mesh";
  dialAndStrap: string;
  description: string;
  specMovement: string;
  specCaseDimensions: string;
  specCrystal: string;
  specWaterResistance: string;
  specHsn: string;
  mrpPaise: number;
  pricePaise: number;
  gstRateBps: number;
  badge: "best_seller" | "new_arrival" | "limited" | null;
  isBestSeller: boolean;
  warrantyYears: number | null;
  status: ProductStatus;
  images: {
    id?: string;
    url: string;
    alt: string;
    sortOrder: number;
    provider?: string | null;
    publicId?: string | null;
  }[];
  stock: { available: number; reserved: number };
  orderItemCount: number;
  reservationCount: number;
  updatedAt: string;
}

export async function listAdminProducts(
  query: AdminProductListQuery = {},
  prismaClient?: PrismaClient,
): Promise<{
  items: AdminProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const prisma = prismaClient ?? getPrisma();
  const pageSize = Math.min(Math.max(1, query.pageSize ?? 12), 50);
  const requestedPage = Math.max(1, query.page ?? 1);
  const q = query.q?.trim();

  const where: Prisma.ProductWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query.brandId ? { brandId: query.brandId } : {}),
    ...(query.categoryId ? { categories: { some: { categoryId: query.categoryId } } } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  let orderBy: Prisma.ProductOrderByWithRelationInput = { updatedAt: "desc" };
  switch (query.sort) {
    case "name-asc":
      orderBy = { name: "asc" };
      break;
    case "price-asc":
      orderBy = { pricePaise: "asc" };
      break;
    case "price-desc":
      orderBy = { pricePaise: "desc" };
      break;
    case "created-desc":
      orderBy = { createdAt: "desc" };
      break;
    case "updated-desc":
    default:
      orderBy = { updatedAt: "desc" };
  }

  const total = await prisma.product.count({ where });
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

  const rows = await prisma.product.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      brand: { select: { id: true, name: true } },
      categories: { include: { category: { select: { id: true, name: true } } } },
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      stock: true,
    },
  });

  return {
    items: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      sku: r.sku,
      name: r.name,
      brandId: r.brand.id,
      brandName: r.brand.name,
      categories: r.categories.map((c) => c.category),
      mrpPaise: r.mrpPaise,
      pricePaise: r.pricePaise,
      discountPercent: discountPercent(r.mrpPaise, r.pricePaise),
      gstRateBps: r.gstRateBps,
      specHsn: r.specHsn,
      status: r.status,
      isActive: r.isActive,
      isBestSeller: r.isBestSeller,
      imageUrl: r.images[0]?.url ?? null,
      stockAvailable: r.stock?.available ?? 0,
      stockReserved: r.stock?.reserved ?? 0,
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getAdminProductById(
  productId: string,
  prismaClient?: PrismaClient,
): Promise<AdminProductDetail | null> {
  const prisma = prismaClient ?? getPrisma();
  const r = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      categories: { select: { categoryId: true } },
      images: { orderBy: { sortOrder: "asc" } },
      stock: true,
      _count: { select: { orderItems: true, reservations: true } },
    },
  });
  if (!r) return null;

  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    sku: r.sku,
    brandId: r.brandId,
    categoryIds: r.categories.map((c) => c.categoryId),
    gender: r.gender,
    watchType: r.watchType,
    strapMaterial: r.strapMaterial,
    dialAndStrap: r.dialAndStrap,
    description: r.description,
    specMovement: r.specMovement,
    specCaseDimensions: r.specCaseDimensions,
    specCrystal: r.specCrystal,
    specWaterResistance: r.specWaterResistance,
    specHsn: r.specHsn,
    mrpPaise: r.mrpPaise,
    pricePaise: r.pricePaise,
    gstRateBps: r.gstRateBps,
    badge: r.badge,
    isBestSeller: r.isBestSeller,
    warrantyYears: r.warrantyYears,
    status: r.status,
    images: r.images.map((i) => ({
      id: i.id,
      url: i.url,
      alt: i.alt,
      sortOrder: i.sortOrder,
      provider: i.provider,
      publicId: i.publicId,
    })),
    stock: { available: r.stock?.available ?? 0, reserved: r.stock?.reserved ?? 0 },
    orderItemCount: r._count.orderItems,
    reservationCount: r._count.reservations,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function parseProductInput(rawInput: AdminProductInput) {
  return adminProductInputSchema.safeParse({
    ...rawInput,
    slug: normalizeSlug(rawInput.slug || rawInput.name),
    sku: normalizeSku(rawInput.sku),
  });
}

export async function createAdminProduct(
  actor: AuthenticatedAdmin,
  rawInput: AdminProductInput,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  const parsed = parseProductInput(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product input." };
  }
  const data = parsed.data;

  if (data.status === "PUBLISHED" && !hasAdminPermission(actor.permissions, "catalogue.publish")) {
    return { ok: false, error: "You do not have permission to publish products." };
  }

  const prisma = prismaClient ?? getPrisma();

  const [brand, categories, duplicate] = await Promise.all([
    prisma.brand.findUnique({ where: { id: data.brandId } }),
    data.categoryIds.length > 0
      ? prisma.category.findMany({ where: { id: { in: data.categoryIds } }, select: { id: true } })
      : Promise.resolve([]),
    prisma.product.findFirst({
      where: { OR: [{ slug: data.slug }, { sku: data.sku }] },
      select: { slug: true, sku: true },
    }),
  ]);

  if (!brand) {
    return { ok: false, error: "Selected brand does not exist." };
  }
  if (data.status === "PUBLISHED" && !brand.isActive) {
    return { ok: false, error: "Cannot publish a product under an inactive brand." };
  }
  if (categories.length !== new Set(data.categoryIds).size) {
    return { ok: false, error: "One or more selected categories do not exist." };
  }
  if (duplicate) {
    return {
      ok: false,
      error:
        duplicate.sku === data.sku
          ? "A product with this SKU already exists."
          : "A product with this slug already exists.",
    };
  }

  const productId = `prod_${randomUUID().slice(0, 12)}`;
  const uniqueCategoryIds = Array.from(new Set(data.categoryIds));

  await prisma.$transaction(async (tx) => {
    await tx.product.create({
      data: {
        id: productId,
        name: data.name,
        slug: data.slug,
        sku: data.sku,
        brandId: data.brandId,
        gender: data.gender,
        watchType: data.watchType,
        strapMaterial: data.strapMaterial,
        dialAndStrap: data.dialAndStrap,
        description: data.description,
        specMovement: data.specMovement,
        specCaseDimensions: data.specCaseDimensions,
        specCrystal: data.specCrystal,
        specWaterResistance: data.specWaterResistance,
        specHsn: data.specHsn,
        mrpPaise: data.mrpPaise,
        pricePaise: data.pricePaise,
        gstRateBps: data.gstRateBps,
        badge: data.badge,
        isBestSeller: data.isBestSeller,
        warrantyYears: data.warrantyYears,
        status: data.status,
        isActive: data.status === "PUBLISHED",
      },
    });

    if (uniqueCategoryIds.length > 0) {
      await tx.productCategory.createMany({
        data: uniqueCategoryIds.map((categoryId) => ({ productId, categoryId })),
      });
    }

    if (data.images.length > 0) {
      await tx.productImage.createMany({
        data: data.images.map((img, index) => ({
          productId,
          url: img.url,
          alt: img.alt,
          sortOrder: index,
          provider:
            img.provider ??
            (img.url.startsWith("https://res.cloudinary.com/") ? "cloudinary" : "local"),
          publicId: img.publicId ?? null,
        })),
      });
    }

    await tx.productStock.create({
      data: { productId, available: 0, reserved: 0 },
    });
  });

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "PRODUCT_CREATE",
      targetType: "Product",
      targetId: productId,
      success: true,
      metadata: { sku: data.sku, slug: data.slug, status: data.status },
    },
    prisma,
  );

  revalidateCataloguePaths([data.slug]);
  return { ok: true, productId };
}

export async function updateAdminProduct(
  actor: AuthenticatedAdmin,
  productId: string,
  rawInput: AdminProductInput,
  prismaClient?: PrismaClient,
  storageProvider?: MediaStorageProvider,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseProductInput(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product input." };
  }
  const data = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, status: true },
  });
  if (!existing) {
    return { ok: false, error: "Product not found." };
  }

  if (
    data.status === "PUBLISHED" &&
    existing.status !== "PUBLISHED" &&
    !hasAdminPermission(actor.permissions, "catalogue.publish")
  ) {
    return { ok: false, error: "You do not have permission to publish products." };
  }

  const [brand, categories, duplicate] = await Promise.all([
    prisma.brand.findUnique({ where: { id: data.brandId } }),
    data.categoryIds.length > 0
      ? prisma.category.findMany({ where: { id: { in: data.categoryIds } }, select: { id: true } })
      : Promise.resolve([]),
    prisma.product.findFirst({
      where: {
        id: { not: productId },
        OR: [{ slug: data.slug }, { sku: data.sku }],
      },
      select: { slug: true, sku: true },
    }),
  ]);

  if (!brand) {
    return { ok: false, error: "Selected brand does not exist." };
  }
  if (data.status === "PUBLISHED" && !brand.isActive) {
    return { ok: false, error: "Cannot publish a product under an inactive brand." };
  }
  if (categories.length !== new Set(data.categoryIds).size) {
    return { ok: false, error: "One or more selected categories do not exist." };
  }
  if (duplicate) {
    return {
      ok: false,
      error:
        duplicate.sku === data.sku
          ? "Another product already uses this SKU."
          : "Another product already uses this slug.",
    };
  }

  const uniqueCategoryIds = Array.from(new Set(data.categoryIds));
  const previousImages = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    const prev = await tx.productImage.findMany({
      where: { productId },
      select: { id: true, url: true, provider: true, publicId: true },
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        name: data.name,
        slug: data.slug,
        sku: data.sku,
        brandId: data.brandId,
        gender: data.gender,
        watchType: data.watchType,
        strapMaterial: data.strapMaterial,
        dialAndStrap: data.dialAndStrap,
        description: data.description,
        specMovement: data.specMovement,
        specCaseDimensions: data.specCaseDimensions,
        specCrystal: data.specCrystal,
        specWaterResistance: data.specWaterResistance,
        specHsn: data.specHsn,
        mrpPaise: data.mrpPaise,
        pricePaise: data.pricePaise,
        gstRateBps: data.gstRateBps,
        badge: data.badge,
        isBestSeller: data.isBestSeller,
        warrantyYears: data.warrantyYears,
        status: data.status,
        isActive: data.status === "PUBLISHED",
      },
    });

    await tx.productCategory.deleteMany({ where: { productId } });
    if (uniqueCategoryIds.length > 0) {
      await tx.productCategory.createMany({
        data: uniqueCategoryIds.map((categoryId) => ({ productId, categoryId })),
      });
    }

    await tx.productImage.deleteMany({ where: { productId } });
    if (data.images.length > 0) {
      await tx.productImage.createMany({
        data: data.images.map((img, index) => ({
          productId,
          url: img.url,
          alt: img.alt,
          sortOrder: index,
          provider:
            img.provider ??
            (img.url.startsWith("https://res.cloudinary.com/") ? "cloudinary" : "local"),
          publicId: img.publicId ?? null,
        })),
      });
    }
    return prev;
  });

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "PRODUCT_UPDATE",
      targetType: "Product",
      targetId: productId,
      success: true,
      metadata: { sku: data.sku, slug: data.slug, status: data.status },
    },
    prisma,
  );

  // Durably schedule cleanup for removed assets only AFTER DB commit.
  const retainedUrls = new Set(data.images.map((i) => i.url));
  const retainedPublicIds = new Set(data.images.map((i) => i.publicId).filter(Boolean));
  const removedImages = previousImages.filter(
    (prev) =>
      !retainedUrls.has(prev.url) &&
      (!prev.publicId || !retainedPublicIds.has(prev.publicId)),
  );
  if (removedImages.length > 0) {
    const provider = getMediaStorageProvider(storageProvider);
    for (const oldImg of removedImages) {
      await scheduleAndAttemptMediaCleanup(
        prisma,
        provider,
        oldImg,
        "PRODUCT_IMAGE_REPLACED",
      ).catch(() => undefined);
    }
  }

  revalidateCataloguePaths([existing.slug, data.slug]);
  return { ok: true };
}

export async function cleanupUnreferencedMediaAsset(
  prisma: PrismaClient,
  provider: MediaStorageProvider,
  asset: { url: string; publicId?: string | null },
): Promise<boolean> {
  const referenced = await isMediaAssetReferenced(prisma, asset);
  if (referenced) return false;
  const res = await provider.deleteProductImage({
    publicId: asset.publicId ?? undefined,
    url: asset.url,
  });
  return res.deleted;
}

/**
 * Failure-safe, concurrency-locked replacement:
 * 1. Validate RBAC & initial ownership
 * 2. Upload new asset
 * 3. Lock Product row (`FOR UPDATE`), verify current image, persist in DB;
 *    if DB fails, durably clean up the newly uploaded orphan
 * 4. Only after DB commit, durably schedule cleanup of old unreferenced asset
 */
export async function uploadAndReplaceProductImage(
  actor: AuthenticatedAdmin,
  params: {
    productId: string;
    imageId: string;
    buffer: Buffer;
    originalFilename: string;
    alt?: string;
  },
  prismaClient?: PrismaClient,
  storageProvider?: MediaStorageProvider,
): Promise<{ ok: true; url: string; publicId: string | null } | { ok: false; error: string }> {
  if (!hasAdminPermission(actor.permissions, "products.update")) {
    return { ok: false, error: "You do not have permission to update product images." };
  }

  const prisma = prismaClient ?? getPrisma();
  const provider = getMediaStorageProvider(storageProvider);

  const initialImage = await prisma.productImage.findUnique({
    where: { id: params.imageId },
    include: { product: { select: { id: true, sku: true, slug: true } } },
  });

  if (!initialImage || initialImage.productId !== params.productId) {
    return { ok: false, error: "Product image not found for this product." };
  }

  const uploaded = await provider.saveProductImage({
    buffer: params.buffer,
    originalFilename: params.originalFilename,
    folder: buildSafeCloudinaryFolder(initialImage.product.sku),
  });

  let previousAsset: { url: string; provider: string | null; publicId: string | null };
  try {
    previousAsset = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${params.productId} FOR UPDATE`;
      const lockedImage = await tx.productImage.findUnique({
        where: { id: params.imageId },
        select: { id: true, productId: true, url: true, provider: true, publicId: true },
      });
      if (!lockedImage || lockedImage.productId !== params.productId) {
        throw new Error("Product image no longer exists on this product.");
      }

      await tx.productImage.update({
        where: { id: lockedImage.id },
        data: {
          url: uploaded.url,
          provider: uploaded.provider,
          publicId: uploaded.publicId ?? null,
          ...(params.alt ? { alt: params.alt } : {}),
        },
      });

      return {
        url: lockedImage.url,
        provider: lockedImage.provider,
        publicId: lockedImage.publicId,
      };
    });
  } catch (err) {
    await scheduleAndAttemptMediaCleanup(
      prisma,
      provider,
      {
        url: uploaded.url,
        provider: uploaded.provider,
        publicId: uploaded.publicId ?? null,
      },
      "ORPHAN_ROLLBACK",
    ).catch(() => undefined);

    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to persist replaced product image.",
    };
  }

  await scheduleAndAttemptMediaCleanup(
    prisma,
    provider,
    previousAsset,
    "PRODUCT_IMAGE_REPLACED",
  ).catch(() => undefined);

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "PRODUCT_IMAGE_REPLACE",
      targetType: "ProductImage",
      targetId: params.imageId,
      success: true,
      metadata: { productId: params.productId, newUrl: uploaded.url },
    },
    prisma,
  );

  revalidateCataloguePaths([initialImage.product.slug]);
  return { ok: true, url: uploaded.url, publicId: uploaded.publicId ?? null };
}

/**
 * Deletes a ProductImage by ID inside a Product row lock (`FOR UPDATE`)
 * after verifying RBAC & product ownership, then durably schedules remote cleanup.
 */
export async function deleteProductImageById(
  actor: AuthenticatedAdmin,
  params: { productId: string; imageId: string },
  prismaClient?: PrismaClient,
  storageProvider?: MediaStorageProvider,
): Promise<{ ok: true; remoteDeleted: boolean } | { ok: false; error: string }> {
  if (!hasAdminPermission(actor.permissions, "products.update")) {
    return { ok: false, error: "You do not have permission to delete product images." };
  }

  const prisma = prismaClient ?? getPrisma();
  const provider = getMediaStorageProvider(storageProvider);

  const deletedSnapshot = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${params.productId} FOR UPDATE`;
    const existingImage = await tx.productImage.findUnique({
      where: { id: params.imageId },
      include: { product: { select: { id: true, slug: true } } },
    });

    if (!existingImage || existingImage.productId !== params.productId) {
      return null;
    }

    await tx.productImage.delete({ where: { id: existingImage.id } });
    const remaining = await tx.productImage.findMany({
      where: { productId: params.productId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    for (let i = 0; i < remaining.length; i++) {
      await tx.productImage.update({
        where: { id: remaining[i]!.id },
        data: { sortOrder: i },
      });
    }
    return existingImage;
  });

  if (!deletedSnapshot) {
    return { ok: false, error: "Product image not found for this product." };
  }

  const cleanup = await scheduleAndAttemptMediaCleanup(
    prisma,
    provider,
    {
      url: deletedSnapshot.url,
      provider: deletedSnapshot.provider,
      publicId: deletedSnapshot.publicId,
    },
    "PRODUCT_IMAGE_DELETED",
  ).catch(() => ({ enqueued: false, deletedImmediately: false }));

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "PRODUCT_IMAGE_DELETE",
      targetType: "ProductImage",
      targetId: deletedSnapshot.id,
      success: true,
      metadata: { productId: params.productId, remoteDeleted: cleanup.deletedImmediately },
    },
    prisma,
  );

  revalidateCataloguePaths([deletedSnapshot.product.slug]);
  return { ok: true, remoteDeleted: cleanup.deletedImmediately };
}

export async function setAdminProductStatus(
  actor: AuthenticatedAdmin,
  productId: string,
  status: ProductStatus,
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (status === "PUBLISHED" && !hasAdminPermission(actor.permissions, "catalogue.publish")) {
    return { ok: false, error: "You do not have permission to publish products." };
  }

  const prisma = prismaClient ?? getPrisma();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      brand: { select: { isActive: true } },
      _count: { select: { categories: true } },
    },
  });
  if (!product) {
    return { ok: false, error: "Product not found." };
  }

  if (status === "PUBLISHED") {
    if (!product.brand.isActive) {
      return { ok: false, error: "Cannot publish a product under an inactive brand." };
    }
    if (product.pricePaise <= 0 || product.pricePaise > product.mrpPaise) {
      return { ok: false, error: "Product pricing is invalid for publication." };
    }
    if (product._count.categories < 1) {
      return { ok: false, error: "Assign at least one category before publishing." };
    }
  }

  await prisma.product.update({
    where: { id: productId },
    data: { status, isActive: status === "PUBLISHED" },
  });

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: status === "ARCHIVED" ? "PRODUCT_ARCHIVE" : "PRODUCT_STATUS_CHANGE",
      targetType: "Product",
      targetId: productId,
      success: true,
      metadata: { status },
    },
    prisma,
  );

  revalidateCataloguePaths([product.slug]);
  return { ok: true };
}

export async function deleteAdminProduct(
  actor: AuthenticatedAdmin,
  productId: string,
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { _count: { select: { orderItems: true, reservations: true } } },
  });
  if (!product) {
    return { ok: false, error: "Product not found." };
  }

  if (product._count.orderItems > 0 || product._count.reservations > 0) {
    return {
      ok: false,
      error:
        "Product is referenced by historical orders or inventory reservations and must be archived instead.",
    };
  }

  await prisma.product.delete({ where: { id: productId } });
  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "PRODUCT_DELETE",
      targetType: "Product",
      targetId: productId,
      success: true,
      metadata: { sku: product.sku, slug: product.slug },
    },
    prisma,
  );

  revalidateCataloguePaths([product.slug]);
  return { ok: true };
}
