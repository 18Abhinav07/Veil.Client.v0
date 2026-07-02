// Shared helpers mirroring src/lib/stellar.ts, for the CLI replication scripts.
const RPC_URL = "https://soroban-testnet.stellar.org";
const POOL_ID =
  process.env.NEXT_PUBLIC_POOL_ID ??
  process.env.POOL_ID ??
  "CDEB3AIFRAGHGPLM24EDHHETSH4Y4L4NAYGSHHW7MQWXUQ65G7LEDBFY";
const POOL_DEPLOYMENT_LEDGER = Number(
  process.env.NEXT_PUBLIC_POOL_DEPLOYMENT_LEDGER ??
  process.env.POOL_DEPLOYMENT_LEDGER ??
  "3390591"
);
const USDC_DECIMALS = 7;

export async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

export async function submitSignedXdr(signedXdr) {
  const result = await rpc("sendTransaction", { transaction: signedXdr });
  if (result?.status === "ERROR") {
    throw new Error("sendTransaction ERROR: " + JSON.stringify(result.errorResultXdr ?? result));
  }
  const hash = result?.hash;
  if (!hash) throw new Error("No tx hash in sendTransaction response");
  return hash;
}

export async function waitForTransaction(txHash, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await rpc("getTransaction", { hash: txHash });
    if (result.status === "SUCCESS") return result.ledger;
    if (result.status === "FAILED")
      throw new Error("Transaction failed on-chain: " + JSON.stringify(result.resultXdr ?? ""));
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Timed out waiting for transaction to mine");
}

function base64ToBytes(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}
function readUInt32BE(bytes, offset) {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

export async function findNoteLeafIndex(commitmentHex, minedLedger) {
  const startLedger = Math.max(1, minedLedger - 2);
  return findNoteLeafIndexFromLedger(commitmentHex, startLedger, { timeoutMs: 90_000 });
}

export async function findNoteLeafIndexFromLedger(
  commitmentHex,
  startLedger = Math.max(1, POOL_DEPLOYMENT_LEDGER),
  { timeoutMs = 120_000 } = {}
) {
  const target = commitmentHex.replace(/^0x/, "").toLowerCase();
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  let lastLatestLedger = null;
  let cursor = null;

  while (Date.now() < deadline) {
    let result;
    try {
      const params = {
        filters: [{ type: "contract", contractIds: [POOL_ID] }],
        pagination: cursor ? { limit: 10000, cursor } : { limit: 10000 },
      };
      if (!cursor) params.startLedger = startLedger;
      result = await rpc("getEvents", {
        ...params,
      });
    } catch (error) {
      lastError = error;
      if (isRetryableEventRangeError(error, startLedger)) {
        await sleep(3000);
        continue;
      }
      throw error;
    }

    lastLatestLedger =
      typeof result?.latestLedger === "number" ? result.latestLedger : lastLatestLedger;
    const events = result?.events ?? [];
    const leafIndex = findLeafIndexInEvents(events, target);
    if (leafIndex !== null) return leafIndex;

    const nextCursor = typeof result?.cursor === "string" ? result.cursor : "";
    const nextCursorLedger = nextCursor ? cursorLedger(nextCursor) : null;
    if (nextCursor && nextCursorLedger !== null && lastLatestLedger !== null && nextCursorLedger < lastLatestLedger) {
      cursor = nextCursor;
      continue;
    }

    cursor = null;
    await sleep(3000);
  }

  const lagMessage =
    lastLatestLedger !== null ? `; latest indexed event ledger was ${lastLatestLedger}` : "";
  const errorMessage = lastError ? `; last RPC error was ${String(lastError)}` : "";
  throw new Error(
    `NewCommitment event for ${target.slice(0, 16)}... not found near ledger ${minedLedger}${lagMessage}${errorMessage}`
  );
}

function findLeafIndexInEvents(events, target) {
  for (const ev of events) {
    if (ev.topic.length < 2) continue;
    let commitmentFromEvent;
    try {
      const raw = base64ToBytes(ev.topic[1]);
      if (raw.length < 36) continue;
      commitmentFromEvent = bytesToHex(raw.slice(4)).toLowerCase();
    } catch {
      continue;
    }
    if (commitmentFromEvent !== target) continue;
    const val = base64ToBytes(ev.value);
    return readUInt32BE(val, val.length - 4);
  }
  return null;
}

export function parseEventLedgerRange(error) {
  const match = /startLedger must be within the ledger range:\s*(\d+)\s*-\s*(\d+)/i.exec(
    String(error)
  );
  if (!match) return null;
  return {
    oldest: Number(match[1]),
    newest: Number(match[2]),
  };
}

export function isRetryableEventRangeError(error, requestedStartLedger) {
  const range = parseEventLedgerRange(error);
  if (!range) return false;
  if (requestedStartLedger === undefined) return true;
  return requestedStartLedger > range.newest;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cursorLedger(cursor) {
  const toidText = cursor.split("-")[0];
  try {
    return Number(BigInt(toidText) >> 32n);
  } catch {
    return null;
  }
}

export async function fetchUsdcBalance(address) {
  const resp = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`, { cache: "no-store" });
  if (!resp.ok) return "0";
  const data = await resp.json();
  const usdc = (data.balances ?? []).find(
    (b) => b.asset_code === "USDC" && b.asset_issuer === "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
  );
  return usdc ? usdc.balance : "0";
}

export { POOL_ID, USDC_DECIMALS };
