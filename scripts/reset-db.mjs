import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import { getDirectDatabaseUrl, loadMigrationEnv } from "./apply-migration.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

export const RESET_DATABASE_SQL = [
  "drop schema if exists public cascade",
  "create schema public",
  "create extension if not exists pgcrypto",
  `
do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('grant usage on schema public to %I', role_name);
      execute format('grant all on all tables in schema public to %I', role_name);
      execute format('grant all on all routines in schema public to %I', role_name);
      execute format('grant all on all sequences in schema public to %I', role_name);
      execute format('alter default privileges in schema public grant all on tables to %I', role_name);
      execute format('alter default privileges in schema public grant all on routines to %I', role_name);
      execute format('alter default privileges in schema public grant all on sequences to %I', role_name);
    end if;
  end loop;
end $$;
`.trim(),
];

export function assertResetConfirmed(argv = process.argv, env = process.env) {
  if (argv.includes("--yes") || env.CONFIRM_DB_RESET === "fresh-start") return;
  throw new Error("Refusing to reset database without --yes or CONFIRM_DB_RESET=fresh-start");
}

export async function resetDatabaseWithClient(client) {
  await client.connect();
  try {
    await client.query("begin");
    for (const sql of RESET_DATABASE_SQL) {
      await client.query(sql);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

export async function main(argv = process.argv, env = process.env) {
  assertResetConfirmed(argv, env);
  loadMigrationEnv(env);
  const client = new pg.Client({ connectionString: getDirectDatabaseUrl(env) });
  await resetDatabaseWithClient(client);
  console.log(`Reset public schema for ${root}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
