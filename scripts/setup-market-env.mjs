import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseDotEnv } from "./apply-migration.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const backendEnvPath = join(root, "..", "backend", ".env");
const frontendEnvPath = join(root, ".env.local");
const deploymentsPath = join(root, "..", "backend", "deployments", "testnet", "deployments.json");

const ESCROW_KEYS = [
  "MARKET_ESCROW_BN254_PRIVATE_HEX",
  "MARKET_ESCROW_BN254_PUBLIC_HEX",
  "MARKET_ESCROW_X25519_PRIVATE_HEX",
  "MARKET_ESCROW_X25519_PUBLIC_HEX",
  "MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX",
];

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function randomHex32() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function isHex32(value) {
  return /^[0-9a-fA-F]{64}$/.test(readString(value).replace(/^0x/, ""));
}

function normalizeHex32(value, name) {
  const normalized = readString(value).replace(/^0x/, "").toLowerCase();
  if (!isHex32(normalized)) {
    throw new Error(`${name} must be 32-byte hex`);
  }
  return normalized;
}

async function deriveNotePublicKey(proverApiUrl, notePrivateKeyHex) {
  const baseUrl = readString(proverApiUrl).replace(/\/$/, "");
  if (!baseUrl) throw new Error("PROVER_API_URL is required to derive market escrow note public key");

  const response = await fetch(`${baseUrl}/keys/derive-note-public`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ notePrivateKeyHex }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`derive-note-public failed with ${response.status}: ${text}`);
  }
  return normalizeHex32(data.notePublicKeyHex, "derived note public key");
}

async function generateX25519HexKeypair() {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  );
  const publicKey = await globalThis.crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateJwk = await globalThis.crypto.subtle.exportKey("jwk", keyPair.privateKey);
  if (!privateJwk.d) throw new Error("generated X25519 private key is missing JWK d");
  return {
    publicHex: bytesToHex(new Uint8Array(publicKey)),
    privateHex: bytesToHex(base64UrlToBytes(privateJwk.d)),
  };
}

export async function generateMarketEscrowKeys(proverApiUrl) {
  const notePrivateHex = randomHex32();
  const notePublicHex = await deriveNotePublicKey(proverApiUrl, notePrivateHex);
  const x25519 = await generateX25519HexKeypair();
  return {
    MARKET_ESCROW_BN254_PRIVATE_HEX: notePrivateHex,
    MARKET_ESCROW_BN254_PUBLIC_HEX: notePublicHex,
    MARKET_ESCROW_X25519_PRIVATE_HEX: x25519.privateHex,
    MARKET_ESCROW_X25519_PUBLIC_HEX: x25519.publicHex,
    MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX: randomHex32(),
  };
}

export function buildMarketEnvUpdates({
  backendEnv,
  frontendEnv,
  marketPoolContractId,
  marketPoolDeploymentLedger,
  marketPoolTreeDepth,
  escrowKeys = {},
}) {
  const updates = {};
  updates.MARKET_POOL_ID =
    readString(frontendEnv.MARKET_POOL_ID) || readString(backendEnv.MARKET_POOL_ID) || "veil_market_pool_v1";
  updates.MARKET_POOL_CONTRACT_ID = readString(marketPoolContractId);
  updates.NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID = readString(marketPoolContractId);
  updates.MARKET_POOL_DEPLOYMENT_LEDGER = String(marketPoolDeploymentLedger);
  updates.MARKET_POOL_TREE_DEPTH =
    readString(marketPoolTreeDepth) ||
    readString(frontendEnv.MARKET_POOL_TREE_DEPTH) ||
    readString(backendEnv.MARKET_POOL_TREE_DEPTH) ||
    "15";
  updates.MARKET_POOL_DEPLOYER_KEY_ID =
    readString(frontendEnv.MARKET_POOL_DEPLOYER_KEY_ID) ||
    readString(backendEnv.MARKET_POOL_DEPLOYER_KEY_ID) ||
    "private-payments-deployer";
  updates.MARKET_ADMIN_EMAIL =
    readString(frontendEnv.MARKET_ADMIN_EMAIL) ||
    readString(backendEnv.MARKET_ADMIN_EMAIL) ||
    "abhinavpangaria2003@gmail.com";

  for (const key of ESCROW_KEYS) {
    const value = readString(escrowKeys[key]) || readString(frontendEnv[key]) || readString(backendEnv[key]);
    if (value) updates[key] = normalizeHex32(value, key);
  }

  if (!updates.MARKET_POOL_CONTRACT_ID) {
    throw new Error("MARKET_POOL_CONTRACT_ID is required");
  }
  if (!updates.MARKET_POOL_DEPLOYMENT_LEDGER || updates.MARKET_POOL_DEPLOYMENT_LEDGER === "undefined") {
    throw new Error("MARKET_POOL_DEPLOYMENT_LEDGER is required");
  }
  return updates;
}

function formatDotEnvValue(value) {
  const text = String(value);
  return /[\s#'"]/.test(text) ? JSON.stringify(text) : text;
}

export function upsertDotEnv(text, updates) {
  const seen = new Set();
  const lines = text.split(/\r?\n/).filter((line, index, all) => index < all.length - 1 || line.length > 0);
  const next = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${formatDotEnvValue(updates[match[1]])}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${formatDotEnvValue(value)}`);
  }
  return `${next.join("\n")}\n`;
}

function readPositiveInteger(value, name) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function upsertMarketPoolDeployment(text, {
  poolContractId,
  tokenContractId,
  deploymentLedger,
}) {
  const config = JSON.parse(text);
  const pools = Array.isArray(config.pools) ? config.pools : [];
  const contractId = readString(poolContractId);
  const tokenId = readString(tokenContractId);
  if (!contractId) throw new Error("market pool contract id is required for deployments.json");
  if (!tokenId) throw new Error("token contract id is required for deployments.json");

  const matchingTokenPool = pools.find((pool) => readString(pool.tokenContractId) === tokenId);
  const fallbackPool = matchingTokenPool ?? pools[0];
  const asset =
    matchingTokenPool?.asset ??
    fallbackPool?.asset ??
    { kind: "contract", contractId: tokenId, symbol: "USDC" };
  const marketPool = {
    poolContractId: contractId,
    tokenContractId: tokenId,
    deploymentLedger: readPositiveInteger(deploymentLedger, "market pool deployment ledger"),
    enabled: true,
    asset,
  };

  const index = pools.findIndex((pool) => readString(pool.poolContractId) === contractId);
  const nextPools = [...pools];
  if (index >= 0) nextPools[index] = marketPool;
  else nextPools.push(marketPool);
  return `${JSON.stringify({ ...config, pools: nextPools }, null, 2)}\n`;
}

function readEnvFile(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force-escrow") {
      parsed.forceEscrow = true;
      continue;
    }
    if (arg === "--market-pool-contract-id") {
      parsed.marketPoolContractId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--market-pool-deployment-ledger") {
      parsed.marketPoolDeploymentLedger = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--market-pool-tree-depth") {
      parsed.marketPoolTreeDepth = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

async function main(argv = process.argv, env = process.env) {
  const args = parseArgs(argv);
  const backendText = readEnvFile(backendEnvPath);
  const frontendText = readEnvFile(frontendEnvPath);
  const backendEnv = { ...parseDotEnv(backendText), ...env };
  const frontendEnv = parseDotEnv(frontendText);
  const currentEnv = { ...backendEnv, ...frontendEnv, ...env };

  const forceEscrow = args.forceEscrow || readString(env.MARKET_SETUP_FORCE_ESCROW) === "true";
  const hasEscrow = ESCROW_KEYS.every((key) => isHex32(currentEnv[key]));
  const escrowKeys = hasEscrow && !forceEscrow
    ? {}
    : await generateMarketEscrowKeys(currentEnv.PROVER_API_URL);

  const updates = buildMarketEnvUpdates({
    backendEnv,
    frontendEnv: currentEnv,
    marketPoolContractId:
      args.marketPoolContractId ||
      env.MARKET_POOL_CONTRACT_ID ||
      frontendEnv.MARKET_POOL_CONTRACT_ID ||
      backendEnv.MARKET_POOL_CONTRACT_ID,
    marketPoolDeploymentLedger:
      args.marketPoolDeploymentLedger ||
      env.MARKET_POOL_DEPLOYMENT_LEDGER ||
      frontendEnv.MARKET_POOL_DEPLOYMENT_LEDGER ||
      backendEnv.MARKET_POOL_DEPLOYMENT_LEDGER,
    marketPoolTreeDepth: args.marketPoolTreeDepth || env.MARKET_POOL_TREE_DEPTH,
    escrowKeys,
  });

  writeFileSync(backendEnvPath, upsertDotEnv(backendText, updates));
  if (existsSync(deploymentsPath)) {
    writeFileSync(
      deploymentsPath,
      upsertMarketPoolDeployment(readFileSync(deploymentsPath, "utf8"), {
        poolContractId: updates.MARKET_POOL_CONTRACT_ID,
        tokenContractId:
          currentEnv.NEXT_PUBLIC_USDC_CONTRACT_ID ||
          currentEnv.USDC_CONTRACT_ID ||
          currentEnv.TOKEN_CONTRACT_ID,
        deploymentLedger: updates.MARKET_POOL_DEPLOYMENT_LEDGER,
      }),
    );
  }
  console.log("Market env setup complete (backend .env)");
  console.log(`MARKET_POOL_CONTRACT_ID=${updates.MARKET_POOL_CONTRACT_ID}`);
  console.log(`MARKET_POOL_DEPLOYMENT_LEDGER=${updates.MARKET_POOL_DEPLOYMENT_LEDGER}`);
  console.log(`MARKET_ESCROW_KEYS=${ESCROW_KEYS.every((key) => updates[key]) ? "set" : "missing"}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
