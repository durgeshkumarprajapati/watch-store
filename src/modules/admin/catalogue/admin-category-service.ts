import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditLog } from "../admin-audit-service";
import type { AuthenticatedAdmin } from "../admin-auth-service";
import { revalidateCataloguePaths } from "./catalogue-revalidation";
import {
  adminCategoryInputSchema,
  normalizeSlug,
  type AdminCategoryInput,
} from "./catalogue-schemas";
import { scheduleAndAttemptMediaCleanup } from "./media-cleanup-service";
import type { MediaStorageProvider } from "./media-storage";

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  imageProvider: string | null;
  imagePublicId: string | null;
  parentId: string | null;
  parentName: string | null;
  isActive: boolean;
  productCount: number;
  childCount: number;
  updatedAt: string;
}

export async function listAdminCategories(
  opts?: { q?: string; includeInactive?: boolean },
  prismaClient?: PrismaClient,
): Promise<AdminCategoryRow[]> {
  const prisma = prismaClient ?? getPrisma();
  const q = opts?.q?.trim();
  const rows = await prisma.category.findMany({
    where: {
      ...(opts?.includeInactive === false ? { isActive: true } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      parent: { select: { name: true } },
      _count: { select: { products: true, children: true } },
    },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    image: c.image,
    imageProvider: c.imageProvider,
    imagePublicId: c.imagePublicId,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
    isActive: c.isActive,
    productCount: c._count.products,
    childCount: c._count.children,
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function getAdminCategoryById(
  categoryId: string,
  prismaClient?: PrismaClient,
): Promise<AdminCategoryRow | null> {
  const prisma = prismaClient ?? getPrisma();
  const c = await prisma.category.findUnique({
    where: { id: categoryId },
    include: {
      parent: { select: { name: true } },
      _count: { select: { products: true, children: true } },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    image: c.image,
    imageProvider: c.imageProvider,
    imagePublicId: c.imagePublicId,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
    isActive: c.isActive,
    productCount: c._count.products,
    childCount: c._count.children,
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function wouldCreateCycle(
  prisma: PrismaClient,
  categoryId: string,
  proposedParentId: string,
): Promise<boolean> {
  if (categoryId === proposedParentId) return true;
  let currentId: string | null = proposedParentId;
  const visited = new Set<string>([categoryId]);
  while (currentId) {
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    const parentRow: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = parentRow?.parentId ?? null;
  }
  return false;
}

export async function createAdminCategory(
  actor: AuthenticatedAdmin,
  rawInput: AdminCategoryInput,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; categoryId: string } | { ok: false; error: string }> {
  const parsed = adminCategoryInputSchema.safeParse({
    ...rawInput,
    slug: normalizeSlug(rawInput.slug || rawInput.name),
    parentId: rawInput.parentId || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid category input." };
  }

  const prisma = prismaClient ?? getPrisma();
  const data = parsed.data;

  const existing = await prisma.category.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "A category with this slug already exists." };
  }

  if (data.parentId) {
    const parentExists = await prisma.category.findUnique({
      where: { id: data.parentId },
      select: { id: true },
    });
    if (!parentExists) {
      return { ok: false, error: "Selected parent category does not exist." };
    }
  }

  const categoryId = `cat_${randomUUID().slice(0, 12)}`;
  const resolvedImageProvider = data.image
    ? data.imageProvider ??
      (data.image.startsWith("https://res.cloudinary.com/") ? "cloudinary" : "local")
    : "local";

  await prisma.category.create({
    data: {
      id: categoryId,
      name: data.name,
      slug: data.slug,
      image: data.image ?? null,
      imageProvider: resolvedImageProvider,
      imagePublicId: data.image ? (data.imagePublicId ?? null) : null,
      parentId: data.parentId ?? null,
      isActive: data.isActive,
    },
  });

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "CATEGORY_CREATE",
      targetType: "Category",
      targetId: categoryId,
      success: true,
      metadata: { name: data.name, slug: data.slug, parentId: data.parentId ?? null },
    },
    prisma,
  );

  revalidateCataloguePaths();
  return { ok: true, categoryId };
}

export async function updateAdminCategory(
  actor: AuthenticatedAdmin,
  categoryId: string,
  rawInput: AdminCategoryInput,
  prismaClient?: PrismaClient,
  storageProvider?: MediaStorageProvider,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = adminCategoryInputSchema.safeParse({
    ...rawInput,
    slug: normalizeSlug(rawInput.slug || rawInput.name),
    parentId: rawInput.parentId || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid category input." };
  }

  const prisma = prismaClient ?? getPrisma();
  const data = parsed.data;

  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) {
    return { ok: false, error: "Category not found." };
  }

  const duplicate = await prisma.category.findFirst({
    where: { id: { not: categoryId }, slug: data.slug },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, error: "Another category already uses this slug." };
  }

  if (data.parentId) {
    const parentExists = await prisma.category.findUnique({
      where: { id: data.parentId },
      select: { id: true },
    });
    if (!parentExists) {
      return { ok: false, error: "Selected parent category does not exist." };
    }
    if (await wouldCreateCycle(prisma, categoryId, data.parentId)) {
      return { ok: false, error: "Invalid parent category: circular hierarchy is not allowed." };
    }
  }

  const nextImage = data.image ?? null;
  const nextImageProvider = nextImage
    ? data.imageProvider ??
      (nextImage.startsWith("https://res.cloudinary.com/") ? "cloudinary" : "local")
    : "local";
  const nextImagePublicId = nextImage ? (data.imagePublicId ?? null) : null;

  await prisma.category.update({
    where: { id: categoryId },
    data: {
      name: data.name,
      slug: data.slug,
      image: nextImage,
      imageProvider: nextImageProvider,
      imagePublicId: nextImagePublicId,
      parentId: data.parentId ?? null,
      isActive: data.isActive,
    },
  });

  if (existing.image && existing.image !== nextImage) {
    await scheduleAndAttemptMediaCleanup(
      prisma,
      storageProvider,
      {
        url: existing.image,
        provider: existing.imageProvider,
        publicId: existing.imagePublicId,
      },
      "CATEGORY_IMAGE_REPLACED",
    ).catch(() => undefined);
  }

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "CATEGORY_UPDATE",
      targetType: "Category",
      targetId: categoryId,
      success: true,
      metadata: {
        name: data.name,
        slug: data.slug,
        parentId: data.parentId ?? null,
        isActive: data.isActive,
      },
    },
    prisma,
  );

  revalidateCataloguePaths();
  return { ok: true };
}

export async function deleteAdminCategory(
  actor: AuthenticatedAdmin,
  categoryId: string,
  prismaClient?: PrismaClient,
  storageProvider?: MediaStorageProvider,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { products: true, children: true } } },
  });
  if (!category) {
    return { ok: false, error: "Category not found." };
  }
  if (category._count.products > 0) {
    return {
      ok: false,
      error: "Cannot delete a category assigned to products. Reassign products or deactivate it first.",
    };
  }
  if (category._count.children > 0) {
    return {
      ok: false,
      error: "Cannot delete a category that has subcategories. Reassign or delete subcategories first.",
    };
  }

  await prisma.category.delete({ where: { id: categoryId } });
  if (category.image) {
    await scheduleAndAttemptMediaCleanup(
      prisma,
      storageProvider,
      {
        url: category.image,
        provider: category.imageProvider,
        publicId: category.imagePublicId,
      },
      "CATEGORY_DELETED",
    ).catch(() => undefined);
  }
  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "CATEGORY_DELETE",
      targetType: "Category",
      targetId: categoryId,
      success: true,
      metadata: { name: category.name },
    },
    prisma,
  );

  revalidateCataloguePaths();
  return { ok: true };
}
