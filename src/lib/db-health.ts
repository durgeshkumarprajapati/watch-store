import "server-only";
import { hasDatabaseUrl } from "@/config/env";
import { getPrisma } from "./prisma";

export type DatabaseHealthResult =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: "not_configured" | "unreachable"; message: string };

export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  if (!hasDatabaseUrl()) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Database connection is not configured.",
    };
  }

  const startedAt = Date.now();
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    return {
      ok: false,
      reason: "unreachable",
      message: "Database health check failed.",
    };
  }
}
