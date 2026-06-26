import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Keypair } from "@stellar/stellar-sdk";

export const REQUIRED_MARKET_SMOKE_ENV = [
  "MARKET_SMOKE_USER_COOKIE",
  "MARKET_SMOKE_ADMIN_COOKIE",
  "MARKET_SMOKE_USER_ID",
  "MARKET_SMOKE_USER_WALLET_JSON",
  "MARKET_SMOKE_CONFIRM_RESOLVE",
];

const DEFAULT_FRONTEND_URL = "http://localhost:3002";
const DEFAULT_MARKET_SLUG = "demo-settlement-yes";
const USDC_DECIMALS = 7n;
const USDC_SCALE = 10n ** USDC_DECIMALS;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function internalServiceHeaders(env = process.env) {
  const token = readString(env.INTERNAL_SERVICE_AUTH_TOKEN);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function decimalToUnits(value) {
  const text = readString(value);
  if (!/^[0-9]+(\.[0-9]+)?$/.test(text)) {
    throw new Error("USDC amount must be a positive decimal");
  }
  const [whole, rawFraction = ""] = text.split(".");
  if (rawFraction.length > Number(USDC_DECIMALS)) {
    throw new Error("USDC amount supports at most 7 decimals");
  }
  const units = BigInt(whole) * USDC_SCALE + BigInt(rawFraction.padEnd(Number(USDC_DECIMALS), "0") || "0");
  if (units <= 0n) throw new Error("USDC amount must be positive");
  return units.toString();
}

export function selectSmokeMarket(markets, preferredSlug = "") {
  const isRunnable = (market) => {
    if (!market || market.status !== "open" || !market.poolActive) return false;
    if (!market.closesAt) return true;
    return new Date(market.closesAt).getTime() > Date.now();
  };
  if (preferredSlug) {
    const exact = markets.find((market) => market.slug === preferredSlug);
    return exact && isRunnable(exact) ? exact : null;
  }
  return markets.find(isRunnable) ?? null;
}

export function selectSmokePayoutIds(payouts, userId) {
  const expectedUserId = readString(userId);
  if (!expectedUserId) return [];
  return payouts
    .filter((payout) => readString(payout?.userId ?? payout?.user_id) === expectedUserId)
    .map((payout) => readString(payout?.id))
    .filter(Boolean);
}

function requireEnv(env) {
  const missing = REQUIRED_MARKET_SMOKE_ENV.filter((name) => !readString(env[name]));
  if (missing.length > 0) {
    throw new Error(`Missing required market smoke env: ${missing.join(", ")}`);
  }
}

function readWallet(value) {
  const text = readString(value);
  if (!text) throw new Error("MARKET_SMOKE_USER_WALLET_JSON is required");
  const json = text.startsWith("{") ? text : readFileSync(text, "utf8");
  const wallet = JSON.parse(json);
  for (const field of [
    "stellarPublicKey",
    "stellarSecretKey",
    "bn254NotePrivateKeyHex",
    "membershipBlindingHex",
    "x25519PublicHex",
  ]) {
    if (!readString(wallet[field])) {
      throw new Error(`Wallet JSON is missing ${field}`);
    }
  }
  return wallet;
}

function base64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveNoteKey(wallet, salt, iterations) {
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`spp:private-note:v1:${wallet.bn254NotePrivateKeyHex}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

async function encryptPrivateNote(note, wallet) {
  const iterations = 160_000;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveNoteKey(wallet, salt, iterations);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    new TextEncoder().encode(JSON.stringify(note)),
  );
  return {
    version: 1,
    kdf: {
      name: "PBKDF2-SHA256",
      params: {
        iterations,
        salt: base64Url(salt),
        keyLengthBits: 256,
      },
    },
    encryption: {
      name: "AES-GCM",
      iv: base64Url(iv),
      ciphertext: base64Url(new Uint8Array(ciphertext)),
    },
  };
}

function signPayloadBase64(wallet, payloadBase64) {
  const keypair = Keypair.fromSecret(wallet.stellarSecretKey);
  if (keypair.publicKey() !== wallet.stellarPublicKey) {
    throw new Error("Wallet stellarSecretKey does not match stellarPublicKey");
  }
  return Buffer.from(keypair.sign(Buffer.from(payloadBase64, "base64"))).toString("base64");
}

async function requestJson(baseUrl, path, { cookie, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...internalServiceHeaders(),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${text}`);
  }
  return data;
}

async function finalizeDeposit(baseUrl, userCookie, prepared, submitted) {
  let current = submitted;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (current.indexingStatus === "indexed") return current;
    await sleep(5000);
    current = await requestJson(baseUrl, "/api/markets/deposits", {
      cookie: userCookie,
      method: "POST",
      body: {
        intent: "finalize",
        noteCommitmentHex: prepared.noteCommitmentHex,
        txHash: current.txHash,
        minedLedger: current.minedLedger,
      },
    });
  }
  throw new Error(`Market deposit did not index: ${JSON.stringify(current)}`);
}

async function finalizeBet(
  baseUrl,
  userCookie,
  slug,
  routeSuffix,
  prepared,
  submitted,
  changeNote,
  encryptedChangeNoteCiphertext,
) {
  let current = submitted;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (current.escrow?.indexingStatus === "indexed") return current;
    await sleep(5000);
    current = await requestJson(baseUrl, `/api/markets/${encodeURIComponent(slug)}/bets${routeSuffix}`, {
      cookie: userCookie,
      method: "POST",
      body: {
        intent: "finalize",
        betId: prepared.bet.id,
        txHash: current.escrow?.txHash,
        minedLedger: current.escrow?.minedLedger,
        escrowCommitmentHex: prepared.escrow.escrowCommitmentHex,
        escrowEncryptedNoteCiphertext: prepared.escrow.escrowEncryptedNoteCiphertext,
        changeCommitmentHex: changeNote?.commitmentHex ?? null,
        changeAmountUnits: changeNote?.amountUnits ?? null,
        encryptedChangeNoteCiphertext,
      },
    });
  }
  throw new Error(`Market bet did not index: ${JSON.stringify(current)}`);
}

async function executePayout(baseUrl, adminCookie, marketId, payoutIds) {
  let current = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    current = await requestJson(baseUrl, `/api/admin/markets/${encodeURIComponent(marketId)}/payouts`, {
      cookie: adminCookie,
      method: "POST",
      body: { payoutIds },
    });
    if (current.payout?.status === "confirmed") return current;
    await sleep(5000);
  }
  throw new Error(`Market payout did not confirm: ${JSON.stringify(current)}`);
}

function writeEvidence(payload) {
  const path = readString(process.env.MARKET_SMOKE_EVIDENCE_PATH) || "market-smoke-evidence.json";
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  return path;
}

export async function main() {
  requireEnv(process.env);
  const baseUrl = (readString(process.env.FRONTEND_URL) || DEFAULT_FRONTEND_URL).replace(/\/$/, "");
  const userCookie = readString(process.env.MARKET_SMOKE_USER_COOKIE);
  const adminCookie = readString(process.env.MARKET_SMOKE_ADMIN_COOKIE);
  const userId = readString(process.env.MARKET_SMOKE_USER_ID);
  const wallet = readWallet(process.env.MARKET_SMOKE_USER_WALLET_JSON);
  const preferredSlug = readString(process.env.MARKET_SMOKE_MARKET_SLUG) || DEFAULT_MARKET_SLUG;
  const confirmResolve = readString(process.env.MARKET_SMOKE_CONFIRM_RESOLVE);
  const depositUnits = decimalToUnits(process.env.MARKET_SMOKE_DEPOSIT_USDC ?? "5");
  const stakeUnits = decimalToUnits(process.env.MARKET_SMOKE_STAKE_USDC ?? "1");
  const outcome = readString(process.env.MARKET_SMOKE_OUTCOME) || "YES";
  if (outcome !== "YES" && outcome !== "NO") throw new Error("MARKET_SMOKE_OUTCOME must be YES or NO");

  const marketRouteSuffix = preferredSlug === DEFAULT_MARKET_SLUG ? "?includeDemo=smoke" : "";
  const marketsPayload = await requestJson(baseUrl, `/api/markets${marketRouteSuffix}`, { cookie: userCookie });
  const market = selectSmokeMarket(marketsPayload.markets ?? [], preferredSlug);
  if (!market) throw new Error(`No open active market found for ${preferredSlug}`);
  if (confirmResolve !== market.slug) {
    throw new Error(`Set MARKET_SMOKE_CONFIRM_RESOLVE=${market.slug} to allow admin resolution`);
  }

  console.log(`Market smoke: ${market.slug}, deposit ${depositUnits}, stake ${stakeUnits}, outcome ${outcome}`);

  const preparedDeposit = await requestJson(baseUrl, "/api/markets/deposits", {
    cookie: userCookie,
    method: "POST",
    body: {
      intent: "prepare",
      source: wallet.stellarPublicKey,
      amountUnits: depositUnits,
      notePrivateKeyHex: wallet.bn254NotePrivateKeyHex,
      senderEncryptionPublicHex: wallet.x25519PublicHex,
      membershipBlindingHex: wallet.membershipBlindingHex,
    },
  });
  const submittedDeposit = await requestJson(baseUrl, "/api/markets/deposits", {
    cookie: userCookie,
    method: "POST",
    body: {
      intent: "submit",
      source: wallet.stellarPublicKey,
      unsignedXdr: preparedDeposit.unsignedXdr,
      signatureBase64: signPayloadBase64(wallet, preparedDeposit.signingPayloadBase64),
      noteCommitmentHex: preparedDeposit.noteCommitmentHex,
    },
  });
  const indexedDeposit = await finalizeDeposit(baseUrl, userCookie, preparedDeposit, submittedDeposit);
  const depositedNote = {
    blindingHex: preparedDeposit.noteBlindingHex,
    commitmentHex: preparedDeposit.noteCommitmentHex,
    amountUnits: preparedDeposit.amountUnits ?? depositUnits,
    leafIndex: indexedDeposit.leafIndex,
    dummyBlindingHex: preparedDeposit.dummyBlindingHex ?? "",
    dummyCommitmentHex: preparedDeposit.dummyCommitmentHex ?? "",
    createdAt: Date.now(),
  };
  const storedDeposit = await requestJson(baseUrl, "/api/markets/deposits", {
    cookie: userCookie,
    method: "POST",
    body: {
      intent: "store",
      commitmentHex: depositedNote.commitmentHex,
      encryptedNoteCiphertext: JSON.stringify(await encryptPrivateNote(depositedNote, wallet)),
      amountUnits: depositedNote.amountUnits,
      leafIndex: depositedNote.leafIndex,
      txHash: indexedDeposit.txHash,
      status: "unspent",
    },
  });

  const preparedBet = await requestJson(baseUrl, `/api/markets/${encodeURIComponent(market.slug)}/bets${marketRouteSuffix}`, {
    cookie: userCookie,
    method: "POST",
    body: {
      intent: "prepare",
      outcome,
      amountUnits: stakeUnits,
      noteId: storedDeposit.note.id,
      inputCommitmentHex: storedDeposit.note.commitmentHex,
      idempotencyKey: `market-smoke:${market.slug}:${Date.now()}`,
      notePrivateKeyHex: wallet.bn254NotePrivateKeyHex,
      senderEncryptionPublicHex: wallet.x25519PublicHex,
      membershipBlindingHex: wallet.membershipBlindingHex,
      noteBlindingHex: depositedNote.blindingHex,
      noteAmountUnits: depositedNote.amountUnits,
      noteLeafIndex: depositedNote.leafIndex,
    },
  });
  const changeNote =
    preparedBet.escrow?.changeNote && BigInt(preparedBet.escrow.changeNote.amountUnits || "0") > 0n
      ? preparedBet.escrow.changeNote
      : null;
  const encryptedChangeNoteCiphertext = changeNote
    ? JSON.stringify(await encryptPrivateNote(changeNote, wallet))
    : null;
  const submittedBet = await requestJson(baseUrl, `/api/markets/${encodeURIComponent(market.slug)}/bets${marketRouteSuffix}`, {
    cookie: userCookie,
    method: "POST",
    body: {
      intent: "submit",
      betId: preparedBet.bet.id,
      relayBody: preparedBet.escrow.relayBody,
      escrowCommitmentHex: preparedBet.escrow.escrowCommitmentHex,
      escrowEncryptedNoteCiphertext: preparedBet.escrow.escrowEncryptedNoteCiphertext,
      changeCommitmentHex: changeNote?.commitmentHex ?? null,
      changeAmountUnits: changeNote?.amountUnits ?? null,
      encryptedChangeNoteCiphertext,
    },
  });
  const indexedBet = await finalizeBet(
    baseUrl,
    userCookie,
    market.slug,
    marketRouteSuffix,
    preparedBet,
    submittedBet,
    changeNote,
    encryptedChangeNoteCiphertext,
  );

  await requestJson(baseUrl, `/api/admin/markets/${encodeURIComponent(market.id)}/resolve`, {
    cookie: adminCookie,
    method: "POST",
    body: {
      outcome,
      evidenceText: `Automated market smoke resolving ${market.slug} ${outcome}`,
    },
  });
  const payoutQueue = await requestJson(baseUrl, `/api/admin/markets/${encodeURIComponent(market.id)}/payouts`, {
    cookie: adminCookie,
  });
  const payoutIds = selectSmokePayoutIds(payoutQueue.payouts ?? [], userId);
  if (payoutIds.length === 0) {
    throw new Error(`Resolution created no payout queue for smoke user ${userId}`);
  }
  const executedPayout = await executePayout(baseUrl, adminCookie, market.id, payoutIds);
  const payout = executedPayout.payout;
  const payoutCommitmentHex = payout?.payoutCommitmentHex;
  const encryptedNoteCiphertext = payout?.encryptedNoteCiphertext ?? executedPayout.encryptedPayoutNoteCiphertext;
  if (!payout?.id || !payoutCommitmentHex || !encryptedNoteCiphertext) {
    throw new Error(`Executed payout response missing claim data: ${JSON.stringify(executedPayout)}`);
  }
  const claimed = await requestJson(baseUrl, `/api/markets/payouts/${encodeURIComponent(payout.id)}/claim`, {
    cookie: userCookie,
    method: "POST",
    body: {
      commitmentHex: payoutCommitmentHex,
      encryptedNoteCiphertext,
    },
  });

  const evidencePath = writeEvidence({
    market: { id: market.id, slug: market.slug },
    deposit: { txHash: indexedDeposit.txHash, commitmentHex: depositedNote.commitmentHex, leafIndex: depositedNote.leafIndex },
    bet: { id: indexedBet.bet?.id ?? preparedBet.bet.id, txHash: indexedBet.escrow?.txHash },
    payout: { id: payout.id, txHash: executedPayout.txHash ?? payout.txHash, commitmentHex: payoutCommitmentHex },
    claim: { payoutStatus: claimed.payout?.status, noteId: claimed.note?.id },
  });
  console.log(`Market smoke complete. Evidence: ${evidencePath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
