import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function deriveEncryptionKey(): Buffer {
  const secret =
    process.env.AUTH_SECRET?.trim() ||
    process.env.SHIPROCKET_API_PASSWORD?.trim() ||
    "watchstore-local-dev-token-key";
  return createHash("sha256").update(`shiprocket-token:${secret}`).digest();
}

export function encryptShiprocketToken(plainToken: string): string {
  const key = deriveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptShiprocketToken(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token payload.");
  }
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const key = deriveEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
