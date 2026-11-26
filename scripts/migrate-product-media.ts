import { PrismaClient } from "@prisma/client";
import { runProductMediaMigration } from "../src/modules/admin/catalogue/media-migration-service";

async function main() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has("--execute") ? "execute" : "dry-run";
  const prisma = new PrismaClient();

  try {
    const report = await runProductMediaMigration(prisma, { mode });
    console.log(JSON.stringify(report, null, 2));
    if (report.verificationStatus === "COMPLETED_WITH_ERRORS") {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Media migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
