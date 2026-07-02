const RPC_URL = "https://soroban-testnet.stellar.org";
const USDC_DECIMALS = 7;

const POOL_ID =
  process.env.NEXT_PUBLIC_POOL_ID ??
  "CDEB3AIFRAGHGPLM24EDHHETSH4Y4L4NAYGSHHW7MQWXUQ65G7LEDBFY";
const POOL_DEPLOYMENT_LEDGER = Number(
  process.env.NEXT_PUBLIC_POOL_DEPLOYMENT_LEDGER ?? "3390591",
);

export interface PoolEventConfig {
  poolId: string;
  deploymentLedger: number;
}

export interface PoolCommitmentEvent {
  leafIndex: number;
  ledger: number;
  txHash: string;
}

interface RawPoolEvent {
  topic: string[];
  value: string;
  ledger: number;
  txHash?: string;
  inSuccessfulContractCall?: boolean;
}

export function getPoolEventConfig(config: Partial<PoolEventConfig> = {}): PoolEventConfig {
  return {
    poolId: config.poolId ?? POOL_ID,
    deploymentLedger: config.deploymentLedger ?? POOL_DEPLOYMENT_LEDGER,
  };
}

async function rpc(method: string, params: unknown) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

export async function getLatestLedgerSequence(): Promise<number> {
  const result = await rpc("getLatestLedger", {});
  const sequence = Number(result?.sequence);
  if (!Number.isFinite(sequence)) {
    throw new Error("No latest ledger sequence in getLatestLedger response");
  }
  return sequence;
}

export function formatUsdc(units: string | number): string {
  const n = typeof units === "string" ? BigInt(units) : BigInt(Math.round(Number(units)));
  const whole = n / BigInt(10 ** USDC_DECIMALS);
  const frac = n % BigInt(10 ** USDC_DECIMALS);
  return `${whole}.${frac.toString().padStart(USDC_DECIMALS, "0")} USDC`;
}

export function usdcToUnits(amount: string): string {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  return (BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(fracPadded)).toString();
}

export async function fetchUsdcBalance(address: string): Promise<string> {
  try {
    const resp = await fetch(
      `https://horizon-testnet.stellar.org/accounts/${address}`,
      { cache: "no-store" }
    );
    if (!resp.ok) return "0";
    const data = await resp.json();
    const balances: Array<{ asset_code?: string; asset_issuer?: string; balance: string }> =
      data.balances ?? [];
    const usdc = balances.find(
      (b) =>
        b.asset_code === "USDC" &&
        b.asset_issuer === "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    );
    if (!usdc) return "0";
    const [whole, frac = ""] = usdc.balance.split(".");
    const fracPadded = frac.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
    return (
      BigInt(whole) * BigInt(10 ** USDC_DECIMALS) +
      BigInt(fracPadded)
    ).toString();
  } catch {
    return "0";
  }
}

export async function submitSignedXdr(signedXdr: string): Promise<string> {
  const result = await rpc("sendTransaction", { transaction: signedXdr });
  const hash = result?.hash;
  if (!hash) throw new Error("No tx hash in sendTransaction response");
  return hash as string;
}

/** Poll until the transaction is SUCCESS or FAILED. Returns the ledger it landed in. */
export async function waitForTransaction(
  txHash: string,
  timeoutMs = 120_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await rpc("getTransaction", { hash: txHash });
    if (result.status === "SUCCESS") return result.ledger as number;
    if (result.status === "FAILED") throw new Error("Transaction failed on-chain");
    // NOT_FOUND or PENDING — wait a ledger (~5 s)
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Timed out waiting for transaction to mine");
}

/**
 * Find the leaf index of a note commitment in the pool's NewCommitment events.
 * Scans events around the ledger the deposit mined in.
 */
export async function findNoteLeafIndex(
  commitmentHex: string,
  minedLedger: number,
): Promise<number> {
  // Search from a few ledgers before (in case of clock skew) up to current
  const startLedger = Math.max(1, minedLedger - 2);
  return findNoteLeafIndexInPool(commitmentHex, startLedger, {
    timeoutMs: 90_000,
  });
}

export async function findNoteLeafIndexFromLedger(
  commitmentHex: string,
  startLedger = Math.max(1, POOL_DEPLOYMENT_LEDGER),
  options: { timeoutMs?: number } = {},
): Promise<number> {
  return findNoteLeafIndexInPool(commitmentHex, startLedger, options);
}

export async function findNoteLeafIndexInPool(
  commitmentHex: string,
  startLedger = Math.max(1, POOL_DEPLOYMENT_LEDGER),
  options: { timeoutMs?: number; pool?: Partial<PoolEventConfig> } = {},
): Promise<number> {
  const event = await findPoolCommitmentEventInPool(commitmentHex, startLedger, options);
  return event.leafIndex;
}

export async function findPoolCommitmentEventInPool(
  commitmentHex: string,
  startLedger = Math.max(1, POOL_DEPLOYMENT_LEDGER),
  options: { timeoutMs?: number; pool?: Partial<PoolEventConfig> } = {},
): Promise<PoolCommitmentEvent> {
  const target = commitmentHex.replace(/^0x/, "").toLowerCase();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pool = getPoolEventConfig(options.pool);
  // Soroban RPC event ingestion can lag behind transaction success, and the
  // public endpoint is load-balanced across nodes with slightly different event
  // tips. Wait on a deadline instead of a tiny fixed attempt count.
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  let lastLatestLedger: number | null = null;
  let cursor: string | null = null;

  while (Date.now() < deadline) {
    let result;
    try {
      const params: Record<string, unknown> = {
        filters: [{ type: "contract", contractIds: [pool.poolId] }],
        pagination: cursor
          ? { limit: 10000, cursor }
          : { limit: 10000 },
      };
      if (!cursor) {
        params.startLedger = startLedger;
      }
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
    const events: RawPoolEvent[] = result?.events ?? [];

    const event = findPoolCommitmentEventFromEvents(events, target);
    if (event !== null) {
      return event;
    }

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
    lastLatestLedger !== null
      ? `; latest indexed event ledger was ${lastLatestLedger}`
      : "";
  const errorMessage = lastError ? `; last RPC error was ${String(lastError)}` : "";
  throw new Error(
    `NewCommitment event for commitment ${target.slice(0, 16)}... not found in pool ${pool.poolId} from ledger ${startLedger}${lagMessage}${errorMessage}`,
  );
}

export function findPoolCommitmentEventFromEvents(
  events: RawPoolEvent[],
  target: string,
): PoolCommitmentEvent | null {
  const normalizedTarget = target.replace(/^0x/, "").toLowerCase();
  for (const ev of events) {
    if (ev.inSuccessfulContractCall === false) continue;
    if (ev.topic.length < 2) continue;

    // Decode topic[1]: ScVal U256 = 4-byte type tag + 32-byte big-endian value
    let commitmentFromEvent: string;
    try {
      const raw = base64ToBytes(ev.topic[1]);
      if (raw.length < 36) continue;
      commitmentFromEvent = bytesToHex(raw.slice(4)).toLowerCase();
    } catch {
      continue;
    }

    if (commitmentFromEvent !== normalizedTarget) continue;

    // Found — decode index from value. Value is SCV_MAP; last 4 bytes are the u32 index.
    try {
      const val = base64ToBytes(ev.value);
      const idx = readUInt32BE(val, val.length - 4);
      return {
        leafIndex: idx,
        ledger: ev.ledger,
        txHash: ev.txHash ?? "",
      };
    } catch {
      throw new Error("Failed to decode leaf index from NewCommitment event");
    }
  }

  return null;
}

export function parseEventLedgerRange(
  error: unknown,
): { oldest: number; newest: number } | null {
  const match = /startLedger must be within the ledger range:\s*(\d+)\s*-\s*(\d+)/i.exec(
    String(error),
  );
  if (!match) return null;
  return {
    oldest: Number(match[1]),
    newest: Number(match[2]),
  };
}

export function isRetryableEventRangeError(
  error: unknown,
  requestedStartLedger?: number,
): boolean {
  const range = parseEventLedgerRange(error);
  if (!range) return false;
  if (requestedStartLedger === undefined) return true;
  return requestedStartLedger > range.newest;
}

export function explorerUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

// ── browser-safe binary helpers ───────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function cursorLedger(cursor: string): number | null {
  const toidText = cursor.split("-")[0];
  try {
    return Number(BigInt(toidText) >> BigInt(32));
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
