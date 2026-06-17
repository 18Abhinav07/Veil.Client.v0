import test from "node:test";
import assert from "node:assert/strict";

import { fetchJsonWithRetry } from "./upstreamRetry";

test("retries network-level upstream fetch failures before returning JSON", async () => {
  let calls = 0;
  const result = await fetchJsonWithRetry<{ ok: true }>(
    "http://upstream.example/prove/withdraw",
    { method: "POST" },
    {
      serviceName: "prover-api",
      tries: 3,
      delayMs: 0,
      isRetryableStatus: () => false,
      sleep: async () => {},
      fetcher: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("fetch failed");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("labels exhausted upstream fetch failures with the service name", async () => {
  const error = await fetchJsonWithRetry(
    "http://upstream.example/relay",
    { method: "POST" },
    {
      serviceName: "relayer",
      tries: 2,
      delayMs: 0,
      isRetryableStatus: () => false,
      sleep: async () => {},
      fetcher: async () => {
        throw new TypeError("fetch failed");
      },
    },
  ).then(
    () => undefined,
    (err: unknown) => err,
  );

  assert.ok(error instanceof Error);
  assert.match(error.message, /relayer fetch failed after 2 attempts/);
  assert.match(error.message, /fetch failed/);
});

test("can fail fast on network-level upstream fetch failures", async () => {
  let calls = 0;
  const error = await fetchJsonWithRetry(
    "http://upstream.example/relay",
    { method: "POST" },
    {
      serviceName: "relayer",
      tries: 18,
      delayMs: 0,
      retryFetchErrors: false,
      isRetryableStatus: () => false,
      sleep: async () => {},
      fetcher: async () => {
        calls += 1;
        throw new TypeError("fetch failed");
      },
    },
  ).then(
    () => undefined,
    (err: unknown) => err,
  );

  assert.ok(error instanceof Error);
  assert.equal(calls, 1);
  assert.match(error.message, /relayer fetch failed after 1 attempt/);
});
