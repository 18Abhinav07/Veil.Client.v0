import nextEnv from "@next/env";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const { loadEnvConfig } = nextEnv;

loadEnvConfig(root);

const appUrl = (
  process.env.WORKER_APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://127.0.0.1:3002"
).replace(/\/$/, "");
const token = process.env.INTERNAL_SERVICE_AUTH_TOKEN?.trim();
const pollMs = Math.max(1000, Number(process.env.WORKER_POLL_MS ?? "5000"));
const once = process.argv.includes("--once") || process.env.WORKER_ONCE === "true";

if (!token) {
  console.error("INTERNAL_SERVICE_AUTH_TOKEN is required for the spend worker");
  process.exit(1);
}

let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tick() {
  const response = await fetch(`${appUrl}/api/internal/spend-worker/tick`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(900_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`worker tick failed: HTTP ${response.status} ${body}`);
  }
  const parsed = body ? JSON.parse(body) : {};
  const status = parsed.result?.status ?? "unknown";
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      status,
      jobId: parsed.result?.jobId ?? null,
      stepId: parsed.result?.stepId ?? null,
      txHash: parsed.result?.txHash ?? null,
    }),
  );
  return status;
}

async function main() {
  do {
    try {
      const status = await tick();
      if (once) return;
      await sleep(status === "advanced" ? 250 : pollMs);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      if (once) process.exit(1);
      await sleep(pollMs);
    }
  } while (!stopped);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
