import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMigrationWithClient,
  getDirectDatabaseUrl,
  listMigrationPaths,
  parseDotEnv,
} from "./apply-migration.mjs";

class FakeMigrationClient {
  constructor({ failSql = false } = {}) {
    this.failSql = failSql;
    this.calls = [];
  }

  async connect() {
    this.calls.push(["connect"]);
  }

  async query(sql) {
    this.calls.push(["query", sql]);
    if (this.failSql && sql === "create table test(id text)") {
      throw new Error("migration failed");
    }
  }

  async end() {
    this.calls.push(["end"]);
  }
}

test("migration runner requires DIRECT_DATABASE_URL and never falls back to pooled DATABASE_URL", () => {
  assert.equal(
    getDirectDatabaseUrl({
      DATABASE_URL: "postgres://pooled",
      DIRECT_DATABASE_URL: "postgres://direct",
    }),
    "postgres://direct",
  );
  assert.throws(
    () => getDirectDatabaseUrl({ DATABASE_URL: "postgres://pooled" }),
    /DIRECT_DATABASE_URL/,
  );
});

test("migration runner parses quoted dotenv values without exposing unrelated keys", () => {
  const parsed = parseDotEnv(`
DATABASE_URL=postgres://pooled
DIRECT_DATABASE_URL="postgres://direct?sslmode=require"
# COMMENTED=value
`);

  assert.equal(parsed.DIRECT_DATABASE_URL, "postgres://direct?sslmode=require");
  assert.equal(parsed.COMMENTED, undefined);
});

test("migration runner discovers all SQL migrations in order by default", () => {
  const migrations = listMigrationPaths();
  assert.ok(
    migrations.some((path) => path.endsWith("0001_wallet_v2.sql")),
    "wallet v2 migration should be included",
  );
  assert.ok(
    migrations.some((path) => path.endsWith("0002_prediction_markets.sql")),
    "prediction markets migration should be included",
  );
  assert.deepEqual(migrations, [...migrations].sort());
});

test("migration runner applies SQL inside a transaction", async () => {
  const client = new FakeMigrationClient();
  await applyMigrationWithClient(client, "create table test(id text)");

  assert.deepEqual(client.calls, [
    ["connect"],
    ["query", "begin"],
    ["query", "create table test(id text)"],
    ["query", "commit"],
    ["end"],
  ]);
});

test("migration runner rolls back and closes the client when SQL fails", async () => {
  const client = new FakeMigrationClient({ failSql: true });
  await assert.rejects(
    () => applyMigrationWithClient(client, "create table test(id text)"),
    /migration failed/,
  );

  assert.deepEqual(client.calls, [
    ["connect"],
    ["query", "begin"],
    ["query", "create table test(id text)"],
    ["query", "rollback"],
    ["end"],
  ]);
});
