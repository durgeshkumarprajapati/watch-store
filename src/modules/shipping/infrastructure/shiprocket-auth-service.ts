import type { PrismaClient } from "@prisma/client";
import { getServerEnv } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { httpShiprocketClient, type ShiprocketClient } from "./shiprocket-client";
import { decryptShiprocketToken, encryptShiprocketToken } from "./token-crypto";

const TOKEN_ROW_ID = "default";
const TOKEN_TTL_MS = 230 * 60 * 60 * 1000; // 230h buffer under Shiprocket's 240h TTL
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function getShiprocketAuthToken(
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
): Promise<string> {
  const env = getServerEnv();
  if (!env.SHIPROCKET_API_EMAIL || !env.SHIPROCKET_API_PASSWORD) {
    throw new Error(
      "Shiprocket credentials are not configured. Set SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD.",
    );
  }

  const prisma = prismaClient ?? getPrisma();

  // Ensure singleton token row exists atomically before acquiring FOR UPDATE lock.
  await prisma.$executeRaw`
    INSERT INTO "ShiprocketAuthToken" ("id", "encryptedToken", "expiresAt", "updatedAt")
    VALUES (${TOKEN_ROW_ID}, '', to_timestamp(0), NOW())
    ON CONFLICT ("id") DO NOTHING
  `;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ encryptedToken: string; expiresAt: Date }[]>`
      SELECT "encryptedToken", "expiresAt"
      FROM "ShiprocketAuthToken"
      WHERE "id" = ${TOKEN_ROW_ID}
      FOR UPDATE
    `;
    const row = rows[0];
    const nowMs = Date.now();

    if (row && row.encryptedToken && row.expiresAt.getTime() > nowMs + REFRESH_BUFFER_MS) {
      try {
        return decryptShiprocketToken(row.encryptedToken);
      } catch {
        // Fall through to re-authenticate if encryption key rotated.
      }
    }

    const { token } = await client.login(env.SHIPROCKET_API_EMAIL!, env.SHIPROCKET_API_PASSWORD!);
    const encryptedToken = encryptShiprocketToken(token);
    const expiresAt = new Date(nowMs + TOKEN_TTL_MS);

    await tx.shiprocketAuthToken.update({
      where: { id: TOKEN_ROW_ID },
      data: { encryptedToken, expiresAt },
    });

    return token;
  });
}

export async function invalidateShiprocketAuthToken(prismaClient?: PrismaClient): Promise<void> {
  const prisma = prismaClient ?? getPrisma();
  await prisma.shiprocketAuthToken.updateMany({
    where: { id: TOKEN_ROW_ID },
    data: { encryptedToken: "", expiresAt: new Date(0) },
  });
}
