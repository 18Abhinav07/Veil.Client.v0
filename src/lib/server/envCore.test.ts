import test from "node:test";
import assert from "node:assert/strict";

import { mergeEnvWithFallback, parseDotEnvText } from "./envCore";

test("server env parser reads quoted dotenv values and ignores comments", () => {
  const parsed = parseDotEnvText(`
# ignored
DATABASE_URL=postgres://pooled
DIRECT_DATABASE_URL="postgres://direct?sslmode=require"
AUTH_SECRET='secret-value'
`);

  assert.equal(parsed.DATABASE_URL, "postgres://pooled");
  assert.equal(parsed.DIRECT_DATABASE_URL, "postgres://direct?sslmode=require");
  assert.equal(parsed.AUTH_SECRET, "secret-value");
});

test("server env merge lets real process env override archive fallback values", () => {
  const merged = mergeEnvWithFallback(
    { DATABASE_URL: "postgres://runtime", AUTH_SECRET: undefined },
    { DATABASE_URL: "postgres://fallback", AUTH_SECRET: "fallback-secret" },
  );

  assert.equal(merged.DATABASE_URL, "postgres://runtime");
  assert.equal(merged.AUTH_SECRET, "fallback-secret");
});
