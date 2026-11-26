import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSafeCloudinaryFolder,
  buildSafeCloudinaryPublicId,
  CloudinaryConfigurationError,
  CloudinaryMediaStorageProvider,
  signCloudinaryParams,
} from "@/modules/admin/catalogue/cloudinary-media-storage";
import {
  detectImageMimeType,
  getMediaStorageProvider,
  LocalMediaStorageProvider,
  MAX_IMAGE_SIZE_BYTES,
} from "@/modules/admin/catalogue/media-storage";

// Minimal valid 12+ byte magic-byte headers
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const VALID_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const VALID_WEBP = Buffer.from("RIFF\x24\x00\x00\x00WEBP", "ascii");

describe("Phase 15 Cloudinary & Media Storage Unit Tests", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("selects local provider in dev when unconfigured, and fail-closed Cloudinary in production", async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";

    expect(getMediaStorageProvider().providerName).toBe("local");

    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const prodProvider = getMediaStorageProvider();
    expect(prodProvider.providerName).toBe("cloudinary");

    await expect(
      prodProvider.saveProductImage({ buffer: VALID_PNG, originalFilename: "watch.png" }),
    ).rejects.toBeInstanceOf(CloudinaryConfigurationError);

    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    expect(getMediaStorageProvider().providerName).toBe("cloudinary");
  });

  it("computes exact Cloudinary SHA-1 signatures for upload, destroy, and explicit verify", async () => {
    const secret = "my_secret";
    const expectedUploadSig = createHash("sha1")
      .update("folder=watchstore/products&overwrite=true&public_id=img_1&timestamp=1700000000" + secret)
      .digest("hex");

    const sig = signCloudinaryParams(
      { timestamp: 1700000000, public_id: "img_1", overwrite: true, folder: "watchstore/products" },
      secret,
    );
    expect(sig).toBe(expectedUploadSig);

    const expectedDestroySig = createHash("sha1")
      .update("public_id=watchstore/products/img_1&timestamp=1700000000" + secret)
      .digest("hex");
    expect(
      signCloudinaryParams({ timestamp: 1700000000, public_id: "watchstore/products/img_1" }, secret),
    ).toBe(expectedDestroySig);

    // Verify verifyAsset calls /image/explicit and handles found/not-found
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ secure_url: "https://res.cloudinary.com/demo/image/upload/v1/watchstore/products/img_1.webp" }),
        { status: 200 },
      ),
    );
    const provider = new CloudinaryMediaStorageProvider({
      config: { cloudName: "demo", apiKey: "k123", apiSecret: secret },
      fetchFn: fetchMock,
    });
    const verified = await provider.verifyAsset({ publicId: "watchstore/products/img_1" });
    expect(verified).toEqual({
      exists: true,
      url: "https://res.cloudinary.com/demo/image/upload/v1/watchstore/products/img_1.webp",
    });
  });

  it("uploads and deletes via CloudinaryMediaStorageProvider with sanitized errors", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          secure_url: "https://res.cloudinary.com/demo/image/upload/v1/watchstore/products/img_1.png",
          public_id: "watchstore/products/img_1",
        }),
        { status: 200 },
      ),
    );

    const provider = new CloudinaryMediaStorageProvider({
      config: { cloudName: "demo", apiKey: "k123", apiSecret: "super-secret-value" },
      fetchFn: fetchMock,
    });

    const saved = await provider.saveProductImage({
      buffer: VALID_PNG,
      originalFilename: "watch.png",
      folder: "watchstore/products",
      publicId: "img_1",
    });

    expect(saved.provider).toBe("cloudinary");
    expect(saved.url).toContain("https://res.cloudinary.com/demo/");
    expect(saved.publicId).toBe("watchstore/products/img_1");

    // Failed response must never leak secret
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "bad super-secret-value" } }), { status: 401 }),
    );
    await expect(
      provider.saveProductImage({ buffer: VALID_JPEG, originalFilename: "a.jpg" }),
    ).rejects.toThrow("Media storage provider rejected the image upload.");

    // Invalid response
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ secure_url: "http://bad" }), { status: 200 }));
    await expect(
      provider.saveProductImage({ buffer: VALID_WEBP, originalFilename: "a.webp" }),
    ).rejects.toThrow("Media storage provider returned an invalid asset response.");

    // Delete success & invalid publicId rejection
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    const del = await provider.deleteProductImage({ publicId: "watchstore/products/img_1" });
    expect(del.deleted).toBe(true);

    await expect(
      provider.deleteProductImage({ publicId: "../other-tenant/asset" }),
    ).rejects.toThrow("Invalid media asset identifier for deletion.");
  });

  it("validates image magic bytes and max file size", async () => {
    expect(detectImageMimeType(VALID_PNG)).toBe("image/png");
    expect(detectImageMimeType(VALID_JPEG)).toBe("image/jpeg");
    expect(detectImageMimeType(VALID_WEBP)).toBe("image/webp");
    expect(detectImageMimeType(Buffer.from("not-an-image-at-all"))).toBeNull();

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "ws-media-unit-"));
    try {
      const local = new LocalMediaStorageProvider(tmpDir, "/images/uploads/products");
      await expect(
        local.saveProductImage({ buffer: Buffer.from("fake-png-content") }),
      ).rejects.toThrow("Unsupported image format");

      const oversized = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1, 0);
      VALID_PNG.copy(oversized);
      await expect(local.saveProductImage({ buffer: oversized })).rejects.toThrow("5 MB");

      const stored = await local.saveProductImage({ buffer: VALID_PNG });
      expect(stored.provider).toBe("local");
      expect(stored.url.startsWith("/images/uploads/products/")).toBe(true);

      const deleted = await local.deleteProductImage({ url: stored.url });
      expect(deleted.deleted).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("generates safe Cloudinary folders for products, brands, and categories", () => {
    expect(buildSafeCloudinaryFolder("WS/../../Evil SKU!")).toBe("watchstore/products/ws-evil-sku");
    expect(buildSafeCloudinaryFolder(undefined, "brand")).toBe("watchstore/brands");
    expect(buildSafeCloudinaryFolder(undefined, "category")).toBe("watchstore/categories");
    const idA = buildSafeCloudinaryPublicId({ deterministicKey: "prod-1:img-1" });
    const idB = buildSafeCloudinaryPublicId({ deterministicKey: "prod-1:img-1" });
    expect(idA).toBe(idB);
    expect(idA).toMatch(/^img_[a-f0-9]{20}$/);
  });
});
