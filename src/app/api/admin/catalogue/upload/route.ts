import { NextResponse } from "next/server";
import {
  AdminForbiddenError,
  AdminUnauthorizedError,
  getAuthenticatedAdmin,
} from "@/modules/admin/admin-auth-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildSafeCloudinaryFolder,
  CloudinaryConfigurationError,
} from "@/modules/admin/catalogue/cloudinary-media-storage";
import {
  MAX_IMAGE_SIZE_BYTES,
  mediaStorage,
} from "@/modules/admin/catalogue/media-storage";

export async function POST(request: Request) {
  try {
    const admin = await getAuthenticatedAdmin();
    if (!admin) {
      throw new AdminUnauthorizedError();
    }
    const canUpload =
      hasAdminPermission(admin.permissions, "products.create") ||
      hasAdminPermission(admin.permissions, "products.update") ||
      hasAdminPermission(admin.permissions, "brands.manage") ||
      hasAdminPermission(admin.permissions, "categories.manage");

    if (!canUpload) {
      throw new AdminForbiddenError();
    }

    const limit = checkRateLimit(`media-upload:${admin.adminId}`, 30, 10 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many uploads. Try again in ${limit.retryAfterSeconds}s.` },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Uploaded image file is empty." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image exceeds maximum allowed size of 5 MB." },
        { status: 400 },
      );
    }

    const entityRaw = formData.get("entityType");
    const entityType =
      entityRaw === "brand" || entityRaw === "category" ? entityRaw : "product";

    const skuRaw = formData.get("sku");
    const folder = buildSafeCloudinaryFolder(
      typeof skuRaw === "string" && skuRaw.trim() ? skuRaw : undefined,
      entityType,
    );

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const saved = await mediaStorage.saveProductImage({
      buffer,
      originalFilename: file.name,
      folder,
    });

    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    if (error instanceof AdminUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof CloudinaryConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Failed to upload image.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
