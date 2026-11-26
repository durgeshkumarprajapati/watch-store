import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenType, Prisma, PrismaClient } from "@prisma/client";

export function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function createAuthActionToken(
  client: PrismaClient | Prisma.TransactionClient,
  params: {
    userId: string;
    type: AuthTokenType;
    ttlMinutes: number;
    targetEmail?: string;
  },
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateRawToken();
  const tokenHash = hashAuthToken(rawToken);
  const expiresAt = new Date(Date.now() + params.ttlMinutes * 60 * 1000);

  // Invalidate previous unused tokens of the same type for this user
  await client.authActionToken.updateMany({
    where: { userId: params.userId, type: params.type, usedAt: null },
    data: { usedAt: new Date() },
  });

  await client.authActionToken.create({
    data: {
      userId: params.userId,
      type: params.type,
      tokenHash,
      targetEmail: params.targetEmail ?? null,
      expiresAt,
    },
  });

  return { rawToken, expiresAt };
}

export async function consumeAuthActionTokenInTx(
  tx: Prisma.TransactionClient,
  params: {
    rawToken: string;
    type: AuthTokenType;
    now?: Date;
  },
): Promise<
  | { ok: true; userId: string; targetEmail: string | null }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "USED" }
> {
  const tokenHash = hashAuthToken(params.rawToken);
  const now = params.now ?? new Date();

  const record = await tx.authActionToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.type !== params.type) {
    return { ok: false, reason: "INVALID" };
  }
  if (record.usedAt !== null) {
    return { ok: false, reason: "USED" };
  }
  if (record.expiresAt <= now) {
    return { ok: false, reason: "EXPIRED" };
  }

  const updated = await tx.authActionToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (updated.count !== 1) {
    return { ok: false, reason: "USED" };
  }

  return {
    ok: true,
    userId: record.userId,
    targetEmail: record.targetEmail,
  };
}
