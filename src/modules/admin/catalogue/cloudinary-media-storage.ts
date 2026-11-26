import { createHash, randomUUID } from "node:crypto";
import {
  type MediaStorageProvider,
  type StoredMediaResult,
  validateImageBuffer,
} from "./media-storage";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const SAFE_FOLDER_RE = /^watchstore(?:\/[a-zA-Z0-9_-]+)*$/;
const SAFE_PUBLIC_ID_RE = /^watchstore\/[a-zA-Z0-9/_-]+$/;

export function sanitizeCloudinarySegment(value: string, fallback = "item"): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 64) || fallback;
}

export function buildSafeCloudinaryFolder(
  sku?: string,
  entityType: "product" | "brand" | "category" = "product",
): string {
  if (entityType === "brand") return "watchstore/brands";
  if (entityType === "category") return "watchstore/categories";
  if (!sku) return "watchstore/products";
  return `watchstore/products/${sanitizeCloudinarySegment(sku, "general")}`;
}

export function buildSafeCloudinaryPublicId(params?: {
  deterministicKey?: string;
}): string {
  if (params?.deterministicKey) {
    const hash = createHash("sha256").update(params.deterministicKey).digest("hex").slice(0, 20);
    return `img_${hash}`;
  }
  return `img_${randomUUID().replace(/-/g, "")}`;
}

export function signCloudinaryParams(
  params: Record<string, string | number | boolean>,
  apiSecret: string,
): string {
  const serialized = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  return createHash("sha1").update(`${serialized}${apiSecret}`).digest("hex");
}

export function getCloudinaryConfigFromEnv(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

export class CloudinaryConfigurationError extends Error {
  constructor(
    message = "Cloudinary media storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the server.",
  ) {
    super(message);
    this.name = "CloudinaryConfigurationError";
  }
}

export class CloudinaryMediaStorageProvider implements MediaStorageProvider {
  public readonly providerName = "cloudinary" as const;
  private readonly explicitConfig?: CloudinaryConfig;
  private readonly fetchFn: typeof fetch;

  constructor(opts?: { config?: CloudinaryConfig; fetchFn?: typeof fetch }) {
    this.explicitConfig = opts?.config;
    this.fetchFn = opts?.fetchFn ?? fetch;
  }

  private resolveConfig(): CloudinaryConfig {
    const cfg = this.explicitConfig ?? getCloudinaryConfigFromEnv();
    if (!cfg) {
      throw new CloudinaryConfigurationError();
    }
    return cfg;
  }

  async saveProductImage(params: {
    buffer: Buffer;
    originalFilename: string;
    folder?: string;
    publicId?: string;
  }): Promise<StoredMediaResult> {
    const { mimeType, sizeBytes } = validateImageBuffer(params.buffer);
    const cfg = this.resolveConfig();

    const folder = params.folder ?? "watchstore/products";
    if (!SAFE_FOLDER_RE.test(folder)) {
      throw new Error("Invalid media storage folder.");
    }

    const rawPublicId = params.publicId ?? buildSafeCloudinaryPublicId();
    const safePublicId = sanitizeCloudinarySegment(rawPublicId, "img");
    const timestamp = Math.floor(Date.now() / 1000);

    const signable = {
      folder,
      overwrite: true,
      public_id: safePublicId,
      timestamp,
    };
    const signature = signCloudinaryParams(signable, cfg.apiSecret);

    const form = new FormData();
    const blob = new Blob([new Uint8Array(params.buffer)], { type: mimeType });
    form.append("file", blob, safePublicId);
    form.append("api_key", cfg.apiKey);
    form.append("timestamp", String(timestamp));
    form.append("folder", folder);
    form.append("public_id", safePublicId);
    form.append("overwrite", "true");
    form.append("signature", signature);

    let res: Response;
    try {
      res = await this.fetchFn(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/upload`,
        {
          method: "POST",
          body: form,
        },
      );
    } catch {
      throw new Error("Media storage upload service is temporarily unreachable.");
    }

    if (!res.ok) {
      throw new Error("Media storage provider rejected the image upload.");
    }

    const json = (await res.json()) as {
      secure_url?: unknown;
      public_id?: unknown;
    };

    if (
      typeof json.secure_url !== "string" ||
      !json.secure_url.startsWith("https://") ||
      typeof json.public_id !== "string" ||
      !json.public_id
    ) {
      throw new Error("Media storage provider returned an invalid asset response.");
    }

    return {
      url: json.secure_url,
      mimeType,
      sizeBytes,
      provider: "cloudinary",
      publicId: json.public_id,
    };
  }

  async deleteProductImage(params: {
    publicId?: string;
    url?: string;
  }): Promise<{ deleted: boolean }> {
    const publicId = params.publicId?.trim();
    if (!publicId) {
      return { deleted: false };
    }
    if (!SAFE_PUBLIC_ID_RE.test(publicId)) {
      throw new Error("Invalid media asset identifier for deletion.");
    }

    const cfg = this.resolveConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signCloudinaryParams(
      {
        public_id: publicId,
        timestamp,
      },
      cfg.apiSecret,
    );

    const body = new URLSearchParams({
      public_id: publicId,
      api_key: cfg.apiKey,
      timestamp: String(timestamp),
      signature,
    });

    let res: Response;
    try {
      res = await this.fetchFn(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/destroy`,
        {
          method: "POST",
          body,
        },
      );
    } catch {
      throw new Error("Media storage delete service is temporarily unreachable.");
    }

    if (!res.ok) {
      throw new Error("Media storage provider failed to delete the image.");
    }

    const json = (await res.json()) as { result?: unknown };
    return { deleted: json.result === "ok" || json.result === "not found" };
  }

  async verifyAsset(params: {
    publicId: string;
  }): Promise<{ exists: boolean; url?: string }> {
    const publicId = params.publicId.trim();
    if (!SAFE_PUBLIC_ID_RE.test(publicId)) {
      return { exists: false };
    }
    const cfg = this.resolveConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signCloudinaryParams(
      {
        public_id: publicId,
        timestamp,
        type: "upload",
      },
      cfg.apiSecret,
    );

    const body = new URLSearchParams({
      public_id: publicId,
      type: "upload",
      api_key: cfg.apiKey,
      timestamp: String(timestamp),
      signature,
    });

    let res: Response;
    try {
      res = await this.fetchFn(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/explicit`,
        {
          method: "POST",
          body,
        },
      );
    } catch {
      return { exists: false };
    }

    if (!res.ok) return { exists: false };
    const json = (await res.json()) as { secure_url?: unknown };
    if (typeof json.secure_url === "string" && json.secure_url.startsWith("https://")) {
      return { exists: true, url: json.secure_url };
    }
    return { exists: false };
  }
}
