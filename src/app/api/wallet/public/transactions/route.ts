import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import {
  decimalToStellarUnits,
  parseHorizonBalance,
  stellarUnitsToDecimal,
  USDC_CODE,
  USDC_ISSUER,
} from "@/lib/publicWalletCore";
import { createAuthOptions } from "@/lib/server/auth";
import { assertXlmSpendable } from "@/lib/server/publicTransactionCore";
import { getPgPool } from "@/lib/server/db";
import {
  createNotification,
  createPublicTransaction,
  findWalletProfileForContact,
  listPublicTransactions,
  recordActivityEvent,
  type PublicTransactionRow,
} from "@/lib/server/walletRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HORIZON_URL =
  process.env.HORIZON_URL ??
  "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";

type PrepareBody = {
  intent: "prepare";
  action: "changeTrust" | "payment" | "swapXlmToUsdc";
  source?: unknown;
  destination?: unknown;
  asset?: unknown;
  amount?: unknown;
  slippageBps?: unknown;
};

type SubmitBody = {
  intent: "submit";
  source?: unknown;
  unsignedXdr?: unknown;
  signatureBase64?: unknown;
};

async function requireUserId() {
  const session = await getServerSession(createAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  return { error: null, userId };
}

function readPublicKey(value: unknown, label: string): string {
  const key = typeof value === "string" ? value.trim() : "";
  try {
    Keypair.fromPublicKey(key);
  } catch {
    throw new Error(`${label} must be a valid Stellar public key`);
  }
  return key;
}

function tryReadPublicKey(value: string): string | null {
  try {
    return readPublicKey(value, "destination");
  } catch {
    return null;
  }
}

function readString(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function readPaymentAsset(value: unknown): Asset {
  if (value === "XLM") return Asset.native();
  if (value === USDC_CODE) return new Asset(USDC_CODE, USDC_ISSUER);
  throw new Error("asset must be XLM or USDC");
}

function readOperationAmount(value: unknown): string {
  const amount = readString(value, "amount");
  return stellarUnitsToDecimal(decimalToStellarUnits(amount));
}

function readSlippageBps(value: unknown): number {
  if (value === undefined || value === null || value === "") return 100;
  const parsed =
    typeof value === "number" ? value : Number(readString(value, "slippageBps"));
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
    throw new Error("slippageBps must be an integer between 0 and 1000");
  }
  return parsed;
}

function bufferToBase64(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function isNotFoundError(error: unknown): boolean {
  const candidate = error as {
    name?: string;
    response?: { status?: number };
  };
  return candidate.name === "NotFoundError" || candidate.response?.status === 404;
}

async function horizonAccountExists(
  server: Horizon.Server,
  publicKey: string,
): Promise<boolean> {
  try {
    await server.loadAccount(publicKey);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

function getNativeBalance(account: Horizon.AccountResponse): string {
  return parseHorizonBalance(
    account.balances.find((balance) => balance.asset_type === "native")?.balance,
  );
}

function hasUsdcTrustline(account: Horizon.AccountResponse): boolean {
  return account.balances.some(
    (balance) =>
      "asset_code" in balance &&
      "asset_issuer" in balance &&
      balance.asset_code === USDC_CODE &&
      balance.asset_issuer === USDC_ISSUER,
  );
}

type HorizonPathAsset = {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
};

type StrictSendPathRecord = {
  path: HorizonPathAsset[];
  destination_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
};

type StrictSendPathPage = {
  records?: StrictSendPathRecord[];
  _embedded?: { records?: StrictSendPathRecord[] };
};

function usdcAsset(): Asset {
  return new Asset(USDC_CODE, USDC_ISSUER);
}

function pathAssetToStellarAsset(asset: HorizonPathAsset): Asset {
  if (asset.asset_type === "native") return Asset.native();
  if (!asset.asset_code || !asset.asset_issuer) {
    throw new Error("Horizon returned an invalid swap path asset");
  }
  return new Asset(asset.asset_code, asset.asset_issuer);
}

function isUsdcPath(record: StrictSendPathRecord): boolean {
  return (
    record.destination_asset_code === USDC_CODE &&
    record.destination_asset_issuer === USDC_ISSUER
  );
}

function destinationUnits(record: StrictSendPathRecord): bigint {
  return BigInt(decimalToStellarUnits(record.destination_amount));
}

function minimumAmountForSlippage(amount: string, slippageBps: number): string {
  const quotedUnits = BigInt(decimalToStellarUnits(amount));
  const minimumUnits =
    (quotedUnits * BigInt(10_000 - slippageBps)) / BigInt(10_000);
  if (minimumUnits <= BigInt(0)) {
    throw new Error("Quoted swap receive amount is too small");
  }
  return stellarUnitsToDecimal(minimumUnits.toString());
}

async function quoteXlmToUsdcStrictSend(
  server: Horizon.Server,
  sendAmount: string,
  slippageBps: number,
) {
  const page = (await server
    .strictSendPaths(Asset.native(), sendAmount, [usdcAsset()])
    .call()) as unknown as StrictSendPathPage;
  const records = page.records ?? page._embedded?.records ?? [];
  const best = records
    .filter(isUsdcPath)
    .sort((left, right) => {
      const leftUnits = destinationUnits(left);
      const rightUnits = destinationUnits(right);
      if (leftUnits === rightUnits) return 0;
      return leftUnits > rightUnits ? -1 : 1;
    })[0];

  if (!best) {
    throw new Error("No XLM to USDC swap path is currently available");
  }

  const estimatedReceive = stellarUnitsToDecimal(
    destinationUnits(best).toString(),
  );
  return {
    estimatedReceive,
    minimumReceive: minimumAmountForSlippage(estimatedReceive, slippageBps),
    path: best.path.map(pathAssetToStellarAsset),
  };
}

async function readLatestBaseReserve(server: Horizon.Server): Promise<number> {
  const root = await server.root();
  const latestLedger = (await server
    .ledgers()
    .ledger(root.history_latest_ledger)
    .call()) as unknown as { base_reserve_in_stroops: number };
  return latestLedger.base_reserve_in_stroops;
}

function assertNativeSpendable(
  account: Horizon.AccountResponse,
  amount: string,
  baseReserveStroops: number,
) {
  assertXlmSpendable({
    xlmBalance: stellarUnitsToDecimal(getNativeBalance(account)),
    amount,
    feeStroops: BASE_FEE,
    baseReserveStroops,
    subentryCount: account.subentry_count,
    numSponsoring: (account as { num_sponsoring?: number }).num_sponsoring,
    numSponsored: (account as { num_sponsored?: number }).num_sponsored,
  });
}

function serializeResolvedRecipient(profile: Awaited<ReturnType<typeof findWalletProfileForContact>>) {
  if (!profile) return null;
  return {
    userId: profile.user_id,
    email: profile.email,
    handle: profile.handle,
    stellarPublicKey: profile.stellar_public_key,
    registeredInPool: profile.registered_in_pool,
  };
}

async function resolvePublicDestination(value: unknown) {
  const query = readString(value, "destination");
  const rawPublicKey = tryReadPublicKey(query);
  if (rawPublicKey) {
    return {
      address: rawPublicKey,
      resolvedRecipient: null as ReturnType<typeof serializeResolvedRecipient>,
    };
  }

  const profile = await findWalletProfileForContact(getPgPool(), { query });
  if (!profile?.stellar_public_key) {
    throw new Error("No public wallet address found for this recipient");
  }
  return {
    address: profile.stellar_public_key,
    resolvedRecipient: serializeResolvedRecipient(profile),
  };
}

async function prepareTransaction(body: PrepareBody) {
  const source = readPublicKey(body.source, "source");
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(source);
  let resolvedRecipient: ReturnType<typeof serializeResolvedRecipient> | undefined;
  let preparedSwapQuote:
    | {
        sendAmount: string;
        estimatedReceive: string;
        minimumReceive: string;
        slippageBps: number;
      }
    | undefined;
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  if (body.action === "changeTrust") {
    builder.addOperation(
      Operation.changeTrust({
        asset: new Asset(USDC_CODE, USDC_ISSUER),
      }),
    );
  } else if (body.action === "swapXlmToUsdc") {
    if (!hasUsdcTrustline(account)) {
      throw new Error("Add a USDC trustline before swapping XLM to USDC");
    }
    const sendAmount = readOperationAmount(body.amount);
    const slippageBps = readSlippageBps(body.slippageBps);
    assertNativeSpendable(account, sendAmount, await readLatestBaseReserve(server));
    const quote = await quoteXlmToUsdcStrictSend(server, sendAmount, slippageBps);
    preparedSwapQuote = {
      sendAmount,
      estimatedReceive: quote.estimatedReceive,
      minimumReceive: quote.minimumReceive,
      slippageBps,
    };
    builder.addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount,
        destination: source,
        destAsset: usdcAsset(),
        destMin: quote.minimumReceive,
        path: quote.path,
      }),
    );
  } else if (body.action === "payment") {
    const resolvedDestination = await resolvePublicDestination(body.destination);
    const destination = resolvedDestination.address;
    resolvedRecipient = resolvedDestination.resolvedRecipient;
    const asset = readPaymentAsset(body.asset);
    const amount = readOperationAmount(body.amount);

    if (asset.isNative()) {
      assertNativeSpendable(account, amount, await readLatestBaseReserve(server));

      if (await horizonAccountExists(server, destination)) {
        builder.addOperation(
          Operation.payment({
            destination,
            asset,
            amount,
          }),
        );
      } else {
        builder.addOperation(
          Operation.createAccount({
            destination,
            startingBalance: amount,
          }),
        );
      }
    } else {
      builder.addOperation(
        Operation.payment({
          destination,
          asset,
          amount,
        }),
      );
    }
  } else {
    throw new Error("Unsupported public wallet action");
  }

  const transaction = builder.setTimeout(180).build();
  return NextResponse.json({
    unsignedXdr: transaction.toXDR(),
    signingPayloadBase64: bufferToBase64(transaction.hash()),
    networkPassphrase: NETWORK_PASSPHRASE,
    ...(resolvedRecipient !== undefined ? { resolvedRecipient } : {}),
    ...(preparedSwapQuote ? { swapQuote: preparedSwapQuote } : {}),
  });
}

function assetCodeFromAsset(asset: Asset | undefined | null): string | null {
  if (!asset) return null;
  if (asset.isNative()) return "XLM";
  return (
    (asset as unknown as { code?: string }).code ??
    (typeof (asset as unknown as { getCode?: () => string }).getCode === "function"
      ? (asset as unknown as { getCode: () => string }).getCode()
      : null)
  );
}

function amountToUnits(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return decimalToStellarUnits(value);
}

function inferPublicTransactionInput(
  transaction: ReturnType<typeof TransactionBuilder.fromXDR>,
  source: string,
  submitted: { hash: string; ledger?: number },
) {
  const operation = transaction.operations[0] as unknown as {
    type?: string;
    destination?: string;
    amount?: string;
    startingBalance?: string;
    asset?: Asset;
    line?: Asset;
    sendAsset?: Asset;
    sendAmount?: string;
    destAsset?: Asset;
    destMin?: string;
    path?: Asset[];
  } | undefined;
  const type = String(operation?.type ?? "");
  if (type === "changeTrust") {
    return {
      sourcePublicKey: source,
      destinationPublicKey: null,
      kind: "trustline" as const,
      assetCode: assetCodeFromAsset(operation?.line) ?? USDC_CODE,
      amountUnits: null,
      txHash: submitted.hash,
      ledger: submitted.ledger ?? null,
      metadata: {},
    };
  }
  if (type === "payment") {
    return {
      sourcePublicKey: source,
      destinationPublicKey: operation?.destination ?? null,
      kind: "payment" as const,
      assetCode: assetCodeFromAsset(operation?.asset),
      amountUnits: amountToUnits(operation?.amount),
      txHash: submitted.hash,
      ledger: submitted.ledger ?? null,
      metadata: {},
    };
  }
  if (type === "createAccount") {
    return {
      sourcePublicKey: source,
      destinationPublicKey: operation?.destination ?? null,
      kind: "payment" as const,
      assetCode: "XLM",
      amountUnits: amountToUnits(operation?.startingBalance),
      txHash: submitted.hash,
      ledger: submitted.ledger ?? null,
      metadata: { operation: "createAccount" },
    };
  }
  if (type === "pathPaymentStrictSend") {
    return {
      sourcePublicKey: source,
      destinationPublicKey: operation?.destination ?? source,
      kind: "swap" as const,
      assetCode: assetCodeFromAsset(operation?.sendAsset) ?? "XLM",
      amountUnits: amountToUnits(operation?.sendAmount),
      txHash: submitted.hash,
      ledger: submitted.ledger ?? null,
      metadata: {
        destinationAssetCode: assetCodeFromAsset(operation?.destAsset),
        destinationMinimumUnits: amountToUnits(operation?.destMin),
        pathLength: operation?.path?.length ?? 0,
      },
    };
  }
  return {
    sourcePublicKey: source,
    destinationPublicKey: null,
    kind: "payment" as const,
    assetCode: null,
    amountUnits: null,
    txHash: submitted.hash,
    ledger: submitted.ledger ?? null,
    metadata: { operationType: type || "unknown" },
  };
}

function serializePublicTransaction(row: PublicTransactionRow) {
  return {
    id: row.id,
    sourcePublicKey: row.source_public_key,
    destinationPublicKey: row.destination_public_key,
    kind: row.kind,
    assetCode: row.asset_code,
    amountUnits: row.amount_units,
    txHash: row.tx_hash,
    ledger: row.ledger,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function persistSubmittedPublicTransaction(
  userId: string,
  transaction: ReturnType<typeof TransactionBuilder.fromXDR>,
  source: string,
  submitted: { hash: string; ledger?: number },
) {
  const db = getPgPool();
  const input = inferPublicTransactionInput(transaction, source, submitted);
  const row = await createPublicTransaction(db, {
    userId,
    ...input,
    status: "confirmed",
  });
  const event = await recordActivityEvent(db, {
    userId,
    eventType: `public_${input.kind}_confirmed`,
    eventData: {
      publicTransactionId: row?.id,
      sourcePublicKey: input.sourcePublicKey,
      destinationPublicKey: input.destinationPublicKey,
      assetCode: input.assetCode,
      amountUnits: input.amountUnits,
    },
    txHash: submitted.hash,
  });
  await createNotification(db, {
    userId,
    activityEventId: event?.id,
    type: `public_${input.kind}_confirmed`,
    severity: "success",
    entityKind: "public_transaction",
    entityId: row?.id,
    title: input.kind === "swap" ? "Swap completed" : input.kind === "trustline" ? "Trustline added" : "Public transaction confirmed",
    body: "Your public Stellar transaction is now in history.",
    actionUrl: "/wallet?mode=public&tab=activity",
  });
}

async function submitTransaction(body: SubmitBody, userId: string) {
  const source = readPublicKey(body.source, "source");
  const unsignedXdr = readString(body.unsignedXdr, "unsignedXdr");
  const signatureBase64 = readString(body.signatureBase64, "signatureBase64");
  const sourceKeypair = Keypair.fromPublicKey(source);
  const transaction = TransactionBuilder.fromXDR(
    unsignedXdr,
    NETWORK_PASSPHRASE || Networks.TESTNET,
  );

  transaction.signatures.push(
    new xdr.DecoratedSignature({
      hint: sourceKeypair.signatureHint(),
      signature: Buffer.from(signatureBase64, "base64"),
    }),
  );

  const server = new Horizon.Server(HORIZON_URL);
  const submitted = await server.submitTransaction(transaction);
  try {
    await persistSubmittedPublicTransaction(userId, transaction, source, submitted);
  } catch (error) {
    console.error("public transaction persistence failed", error);
  }

  return NextResponse.json({
    txHash: submitted.hash,
    ledger: submitted.ledger,
  });
}

export async function GET(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 50;
  const transactions = await listPublicTransactions(getPgPool(), {
    userId: auth.userId,
    limit,
  });
  return NextResponse.json({ transactions: transactions.map(serializePublicTransaction) });
}

export async function POST(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  try {
    const body = (await request.json()) as PrepareBody | SubmitBody;
    if (body.intent === "prepare") return await prepareTransaction(body);
    if (body.intent === "submit") return await submitTransaction(body, auth.userId);
    return NextResponse.json({ error: "intent must be prepare or submit" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
