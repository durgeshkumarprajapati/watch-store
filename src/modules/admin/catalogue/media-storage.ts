import { randomUUID } from "node:crypto";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CloudinaryMediaStorageProvider,
  getCloudinaryConfigFromEnv,
} from "./cloudinary-media-storage";

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export type SupportedImageMime = "image/webp" | "image/jpeg" | "image/png";
export type MediaProviderKind = "local" | "cloudinary" | "mock";

const MIME_TO_EXT: Record<SupportedImageMime, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Inspects file header magic bytes rather than trusting client-supplied MIME types.
 */
export function detectImageMimeType(buffer: Buffer): SupportedImageMime | null {
  if (buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function validateImageBuffer(buffer: Buffer): {
  mimeType: SupportedImageMime;
  sizeBytes: number;
} {
  if (buffer.length === 0) {
    throw new Error("Uploaded image file is empty.");
  }
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Image exceeds maximum allowed size of 5 MB.");
  }

  const mimeType = detectImageMimeType(buffer);
  if (!mimeType) {
    throw new Error("Unsupported image format. Upload a valid WebP, JPEG, or PNG file.");
  }

  return { mimeType, sizeBytes: buffer.length };
}

export interface StoredMediaResult {
  url: string;
  mimeType: SupportedImageMime;
  sizeBytes: number;
  provider: MediaProviderKind;
  publicId?: string;
}

export interface MediaStorageProvider {
  readonly providerName: MediaProviderKind;
  saveProductImage(params: {
    buffer: Buffer;
    originalFilename: string;
    folder?: string;
    publicId?: string;
  }): Promise<StoredMediaResult>;
  deleteProductImage(params: {
    publicId?: string;
    url?: string;
  }): Promise<{ deleted: boolean }>;
  verifyAsset?(params: {
    publicId: string;
  }): Promise<{ exists: boolean; url?: string }>;
}

/**
 * Local static-folder storage provider for development and automated tests.
 * Never used silently in production when Cloudinary is required.
 */
export class LocalMediaStorageProvider implements MediaStorageProvider {
  public readonly providerName = "local" as const;
  private readonly uploadDir: string;
  private readonly publicPrefix: string;

  constructor(
    uploadDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "images", "uploads", "products"),
    publicPrefix = "/images/uploads/products",
  ) {
    this.uploadDir = uploadDir;
    this.publicPrefix = publicPrefix;
  }

  async saveProductImage(params: {
    buffer: Buffer;
    originalFilename?: string;
  }): Promise<StoredMediaResult> {
    const { mimeType, sizeBytes } = validateImageBuffer(params.buffer);

    await mkdir(this.uploadDir, { recursive: true });
    const ext = MIME_TO_EXT[mimeType];
    const filename = `${randomUUID()}.${ext}`;
    const targetPath = path.join(this.uploadDir, filename);
    await writeFile(targetPath, params.buffer);

    return {
      url: `${this.publicPrefix}/${filename}`,
      mimeType,
      sizeBytes,
      provider: "local",
      publicId: filename,
    };
  }

  async deleteProductImage(params: {
    publicId?: string;
    url?: string;
  }): Promise<{ deleted: boolean }> {
    const targetUrl = params.url?.trim();
    if (!targetUrl || !targetUrl.startsWith(`${this.publicPrefix}/`)) {
      return { deleted: false };
    }
    const filename = path.basename(targetUrl);
    if (!filename || filename.includes("..") || filename !== targetUrl.slice(this.publicPrefix.length + 1)) {
      return { deleted: false };
    }
    try {
      await unlink(path.join(this.uploadDir, filename));
      return { deleted: true };
    } catch {
      return { deleted: false };
    }
  }
}

export function isCloudinaryConfigured(): boolean {
  return getCloudinaryConfigFromEnv() !== null;
}

/**
 * Selects the active media storage provider:
 * - Production ALWAYS selects Cloudinary (fail-closed if credentials are missing).
 * - Development/test selects Cloudinary when configured, otherwise LocalMediaStorageProvider.
 */
export function getMediaStorageProvider(override?: MediaStorageProvider): MediaStorageProvider {
  if (override) return override;
  if (process.env.NODE_ENV === "production") {
    return new CloudinaryMediaStorageProvider();
  }
  if (isCloudinaryConfigured()) {
    return new CloudinaryMediaStorageProvider();
  }
  return new LocalMediaStorageProvider();
}

export const mediaStorage: MediaStorageProvider = {
  get providerName() {
    return getMediaStorageProvider().providerName;
  },
  saveProductImage(params) {
    return getMediaStorageProvider().saveProductImage(params);
  },
  deleteProductImage(params) {
    return getMediaStorageProvider().deleteProductImage(params);
  },
};

export async function listExistingProductImagePaths(): Promise<string[]> {
  const roots = [
    { dir: path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "images", "products"), prefix: "/images/products" },
    {
      dir: path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "images", "uploads", "products"),
      prefix: "/images/uploads/products",
    },
  ];
  const results: string[] = [];

  async function walk(dir: string, prefix: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        const rel = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(full, rel);
        } else if (/\.(webp|jpe?g|png)$/i.test(entry.name)) {
          results.push(rel);
        }
      }
    } catch {
      // Directory may not exist yet (e.g., uploads before first upload).
    }
  }

  for (const root of roots) {
    await walk(root.dir, root.prefix);
  }
  return results.sort();
}
