import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditLog } from "../admin-audit-service";
import type { AuthenticatedAdmin } from "../admin-auth-service";
import { revalidateCataloguePaths } from "./catalogue-revalidation";
import { adminBrandInputSchema, normalizeSlug, type AdminBrandInput } from "./catalogue-schemas";
import { scheduleAndAttemptMediaCleanup } from "./media-cleanup-service";
import type { MediaStorageProvider } from "./media-storage";

export interface AdminBrandRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  logoProvider: string | null;
  logoPublicId: string | null;
  isActive: boolean;
  productCount: number;
  updatedAt: string;
}

export async function listAdminBrands(
  opts?: { q?: string; includeInactive?: boolean },
  prismaClient?: PrismaClient,
): Promise<AdminBrandRow[]> {
  const prisma = prismaClient ?? getPrisma();
  const q = opts?.q?.trim();
  const rows = await prisma.brand.findMany({
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
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    description: b.description,
    logoUrl: b.logoUrl,
    logoProvider: b.logoProvider,
    logoPublicId: b.logoPublicId,
    isActive: b.isActive,
    productCount: b._count.products,
    updatedAt: b.updatedAt.toISOString(),
  }));
}

export async function getAdminBrandById(
  brandId: string,
  prismaClient?: PrismaClient,
): Promise<AdminBrandRow | null> {
  const prisma = prismaClient ?? getPrisma();
  const b = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { _count: { select: { products: true } } },
  });
  if (!b) return null;
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    description: b.description,
    logoUrl: b.logoUrl,
    logoProvider: b.logoProvider,
    logoPublicId: b.logoPublicId,
    isActive: b.isActive,
    productCount: b._count.products,
    updatedAt: b.updatedAt.toISOString(),
  };
}

export async function createAdminBrand(
  actor: AuthenticatedAdmin,
  rawInput: AdminBrandInput,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; brandId: string } | { ok: false; error: string }> {
  const parsed = adminBrandInputSchema.safeParse({
    ...rawInput,
    slug: normalizeSlug(rawInput.slug || rawInput.name),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid brand input." };
  }

  const prisma = prismaClient ?? getPrisma();
  const data = parsed.data;

  const existing = await prisma.brand.findFirst({
    where: {
      OR: [
        { slug: data.slug },
        { name: { equals: data.name, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "A brand with this name or slug already exists." };
  }

  const brandId = `brand_${randomUUID().slice(0, 12)}`;
  const resolvedProvider = data.logoUrl
    ? data.logoProvider ??
      (data.logoUrl.startsWith("https://res.cloudinary.com/") ? "cloudinary" : "local")
    : "local";

  await prisma.brand.create({
    data: {
      id: brandId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      logoUrl: data.logoUrl ?? null,
      logoProvider: resolvedProvider,
      logoPublicId: data.logoUrl ? (data.logoPublicId ?? null) : null,
      isActive: data.isActive,
    },
  });

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "BRAND_CREATE",
      targetType: "Brand",
      targetId: brandId,
      success: true,
      metadata: { name: data.name, slug: data.slug },
    },
    prisma,
  );

  revalidateCataloguePaths();
  return { ok: true, brandId };
}

export async function updateAdminBrand(
  actor: AuthenticatedAdmin,
  brandId: string,
  rawInput: AdminBrandInput,
  prismaClient?: PrismaClient,
  storageProvider?: MediaStorageProvider,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = adminBrandInputSchema.safeParse({
    ...rawInput,
    slug: normalizeSlug(rawInput.slug || rawInput.name),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid brand input." };
  }

  const prisma = prismaClient ?? getPrisma();
  const data = parsed.data;

  const existing = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!existing) {
    return { ok: false, error: "Brand not found." };
  }

  const duplicate = await prisma.brand.findFirst({
    where: {
      id: { not: brandId },
      OR: [
        { slug: data.slug },
        { name: { equals: data.name, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, error: "Another brand already uses this name or slug." };
  }

  const nextLogoUrl = data.logoUrl ?? null;
  const nextLogoProvider = nextLogoUrl
    ? data.logoProvider ??
      (nextLogoUrl.startsWith("https://res.cloudinary.com/") ? "cloudinary" : "local")
    : "local";
  const nextLogoPublicId = nextLogoUrl ? (data.logoPublicId ?? null) : null;

  await prisma.brand.update({
    where: { id: brandId },
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      logoUrl: nextLogoUrl,
      logoProvider: nextLogoProvider,
      logoPublicId: nextLogoPublicId,
      isActive: data.isActive,
    },
  });

  if (existing.logoUrl && existing.logoUrl !== nextLogoUrl) {
    await scheduleAndAttemptMediaCleanup(
      prisma,
      storageProvider,
      {
        url: existing.logoUrl,
        provider: existing.logoProvider,
        publicId: existing.logoPublicId,
      },
      "BRAND_LOGO_REPLACED",
    ).catch(() => undefined);
  }

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "BRAND_UPDATE",
      targetType: "Brand",
      targetId: brandId,
      success: true,
      metadata: { name: data.name, slug: data.slug, isActive: data.isActive },
    },
    prisma,
  );

  revalidateCataloguePaths();
  return { ok: true };
}

export async function deleteAdminBrand(
  actor: AuthenticatedAdmin,
  brandId: string,
  prismaClient?: PrismaClient,
  storageProvider?: MediaStorageProvider,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { _count: { select: { products: true } } },
  });
  if (!brand) {
    return { ok: false, error: "Brand not found." };
  }
  if (brand._count.products > 0) {
    return {
      ok: false,
      error: "Cannot delete a brand referenced by existing products. Deactivate it instead.",
    };
  }

  await prisma.brand.delete({ where: { id: brandId } });
  if (brand.logoUrl) {
    await scheduleAndAttemptMediaCleanup(
      prisma,
      storageProvider,
      {
        url: brand.logoUrl,
        provider: brand.logoProvider,
        publicId: brand.logoPublicId,
      },
      "BRAND_DELETED",
    ).catch(() => undefined);
  }
  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "BRAND_DELETE",
      targetType: "Brand",
      targetId: brandId,
      success: true,
      metadata: { name: brand.name },
    },
    prisma,
  );

  revalidateCataloguePaths();
  return { ok: true };
}
