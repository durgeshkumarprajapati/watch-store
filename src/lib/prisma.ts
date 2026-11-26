import "server-only";
import { PrismaClient } from "@prisma/client";
import { requireDatabaseUrl } from "@/config/env";

const globalForPrisma = globalThis as unknown as {
  __watchStorePrisma?: PrismaClient;
};

export function getPrisma(): PrismaClient {
  requireDatabaseUrl();
  if (!globalForPrisma.__watchStorePrisma) {
    globalForPrisma.__watchStorePrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
      transactionOptions: {
        maxWait: 10_000,
        timeout: 45_000,
      },
    });
  }
  return globalForPrisma.__watchStorePrisma;
}
