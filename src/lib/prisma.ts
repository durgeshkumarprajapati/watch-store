import "server-only";
import { PrismaClient } from "@prisma/client";
import { requireDatabaseUrl } from "@/config/env";

const SLOW_QUERY_THRESHOLD_MS = 300;

const globalForPrisma = globalThis as unknown as {
  __watchStorePrisma?: PrismaClient;
};

function createInstrumentedPrismaClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    transactionOptions: {
      maxWait: 10_000,
      timeout: 45_000,
    },
  });

  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return base;
  }

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const startedAt = performance.now();
          try {
            return await query(args);
          } finally {
            const durationMs = Math.round(performance.now() - startedAt);
            if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
              console.warn(
                JSON.stringify({
                  event: "slow_prisma_query",
                  model: model ?? "raw",
                  operation,
                  durationMs,
                }),
              );
            }
          }
        },
      },
    },
  }) as unknown as PrismaClient;
}

export function getPrisma(): PrismaClient {
  requireDatabaseUrl();
  if (!globalForPrisma.__watchStorePrisma) {
    globalForPrisma.__watchStorePrisma = createInstrumentedPrismaClient();
  }
  return globalForPrisma.__watchStorePrisma;
}
