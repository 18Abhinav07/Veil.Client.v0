import test from "node:test";
import assert from "node:assert/strict";

import {
  RESET_DATABASE_SQL,
  assertResetConfirmed,
  resetDatabaseWithClient,
} from "./reset-db.mjs";

class FakeResetClient {
  constructor({ failSql } = {}) {
    this.failSql = failSql;
    this.calls = [];
  }

  async connect() {
    this.calls.push(["connect"]);
  }

  async query(sql) {
    this.calls.push(["query", sql]);
    if (this.failSql && sql === this.failSql) {
      throw new Error("reset failed");
    }
  }

  async end() {
    this.calls.push(["end"]);
  }
}

test("database reset requires explicit confirmation", () => {
  assert.doesNotThrow(() => assertResetConfirmed(["node", "reset-db.mjs", "--yes"], {}));
  assert.doesNotThrow(() => assertResetConfirmed(["node", "reset-db.mjs"], { CONFIRM_DB_RESET: "fresh-start" }));
  assert.throws(() => assertResetConfirmed(["node", "reset-db.mjs"], {}), /Refusing to reset database/);
});

test("database reset recreates public schema inside a transaction", async () => {
  const client = new FakeResetClient();
  await resetDatabaseWithClient(client);

  assert.equal(RESET_DATABASE_SQL[0], "drop schema if exists public cascade");
  assert.equal(RESET_DATABASE_SQL[1], "create schema public");
  assert.equal(RESET_DATABASE_SQL[2], "create extension if not exists pgcrypto");
  assert.match(RESET_DATABASE_SQL[3], /alter default privileges/);
  assert.deepEqual(client.calls, [
    ["connect"],
    ["query", "begin"],
    ...RESET_DATABASE_SQL.map((sql) => ["query", sql]),
    ["query", "commit"],
    ["end"],
  ]);
});

test("database reset rolls back and closes the client when SQL fails", async () => {
  const client = new FakeResetClient({ failSql: "create schema public" });
  await assert.rejects(() => resetDatabaseWithClient(client), /reset failed/);

  assert.deepEqual(client.calls, [
    ["connect"],
    ["query", "begin"],
    ["query", "drop schema if exists public cascade"],
    ["query", "create schema public"],
    ["query", "rollback"],
    ["end"],
  ]);
});
