import fs from "node:fs";
import path from "node:path";

export interface MigrationConfig {
  sourceUrl: string;
  destUrl: string;
  dryRun: boolean;
  batchSize: number;
  checkpointFile: string;
  resume: boolean;
}

function parseCommentedEnvVar(envPath: string, key: string): string | undefined {
  if (!fs.existsSync(envPath)) return undefined;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("#")) continue;
    const match = trimmed.slice(1).trim().match(new RegExp(`^${key}=(.+)$`));
    if (match?.[1]) {
      return match[1].replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

function assertSafeDirectUrl(urlStr: string, label: string): void {
  const parsed = new URL(urlStr);
  if (label === "destination") {
    if (parsed.port === "6543" || parsed.searchParams.get("pgbouncer") === "true") {
      throw new Error(
        "Destination URL must use DIRECT_URL (port 5432 session mode), never the port 6543 transaction pooler."
      );
    }
  }
  if (label === "source") {
    const dbName = parsed.pathname.replace(/^\//, "");
    if (dbName !== "watchstore_db") {
      throw new Error(`Source database must be watchstore_db, got "${dbName}".`);
    }
  }
}

export function loadMigrationConfig(argv: string[]): MigrationConfig {
  const envPath = path.resolve(process.cwd(), ".env");
  const sourceUrl =
    process.env.LOCAL_SOURCE_DATABASE_URL ||
    parseCommentedEnvVar(envPath, "DIRECT_URL") ||
    parseCommentedEnvVar(envPath, "DATABASE_URL");

  if (!sourceUrl) {
    throw new Error("Could not resolve local watchstore_db source URL.");
  }

  const destUrl = process.env.DIRECT_URL;
  if (!destUrl) {
    throw new Error("DIRECT_URL environment variable is required for Supabase destination writes.");
  }

  assertSafeDirectUrl(sourceUrl, "source");
  assertSafeDirectUrl(destUrl, "destination");

  const execute = argv.includes("--execute");
  const dryRun = argv.includes("--dry-run") || !execute;
  const resume = argv.includes("--resume");

  const batchArg = argv.find((a) => a.startsWith("--batch-size="));
  const batchVal = batchArg?.split("=")[1];
  const batchSize = batchVal ? Math.max(1, Number.parseInt(batchVal, 10)) : 50;

  const cpArg = argv.find((a) => a.startsWith("--checkpoint-file="));
  const cpVal = cpArg?.split("=")[1];
  const checkpointFile = cpVal
    ? path.resolve(process.cwd(), cpVal)
    : path.resolve("/home/ppsd-021/watchstore-backups", "migration-checkpoint.json");

  return {
    sourceUrl,
    destUrl,
    dryRun,
    batchSize,
    checkpointFile,
    resume,
  };
}
