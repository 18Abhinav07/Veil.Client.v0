import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const { loadEnvConfig } = nextEnv;
const backendRoot = join(root, "..", "backend");

export function parseDotEnv(text) {
  const parsed = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function loadMigrationEnv(env = process.env) {
  loadEnvConfig(root);
  if (!env.DIRECT_DATABASE_URL) {
    try {
      const backendEnv = parseDotEnv(readFileSync(join(backendRoot, ".env"), "utf8"));
      if (backendEnv.DIRECT_DATABASE_URL) {
        env.DIRECT_DATABASE_URL = backendEnv.DIRECT_DATABASE_URL;
      }
    } catch {
      // getDirectDatabaseUrl reports the missing variable consistently.
    }
  }
}

export function getDirectDatabaseUrl(env = process.env) {
  const value = env.DIRECT_DATABASE_URL;
  if (!value) {
    throw new Error("DIRECT_DATABASE_URL is required to apply Wallet V2 migrations");
  }
  return value;
}

export async function applyMigrationWithClient(client, sql) {
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

export function listMigrationPaths(rootDir = root) {
  const migrationsDir = join(rootDir, "db", "migrations");
  return readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .map((entry) => join(migrationsDir, entry));
}

export async function main(argv = process.argv, env = process.env) {
  loadMigrationEnv(env);
  const migrationPaths = argv[2] ? [argv[2]] : listMigrationPaths(root);
  const databaseUrl = getDirectDatabaseUrl(env);

  for (const migrationPath of migrationPaths) {
    const sql = readFileSync(migrationPath, "utf8");
    const client = new pg.Client({ connectionString: databaseUrl });
    await applyMigrationWithClient(client, sql);
    console.log(`Applied migration ${migrationPath.replace(root + "/", "")}`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
