<p align="center">
  <img src="./public/Veil_Bg_Removed_Logo.png" alt="Veil logo" width="96" />
</p>

<h1 align="center">V E I L</h1>

<p align="center">
  A private USDC wallet and prediction market built on Stellar testnet privacy pools.
</p>

<p align="center">
  <img src="./public/Veil_Logo.png" alt="Veil wordmark" width="420" />
</p>

## Overview

Veil is a Next.js application for private USDC payments, private note-to-note transfers, batch payouts, and private prediction markets. The frontend owns the authenticated product experience, encrypted wallet vault, portfolio surfaces, background spend-worker client, market admin console, and deployment checks for the Supabase-backed app state.

The app is designed around two privacy-pool lanes:

- **Wallet pool**: deposit public USDC into private notes, send privately, batch pay, receive notes, and withdraw.
- **Market pool**: deposit public USDC into Market Notes, place private YES/NO market bets, receive private payouts, claim payout notes, and withdraw Market Notes back to the public wallet.

The current deployment target is Stellar testnet.

## Product Surface

- **Google-authenticated wallet** with encrypted client-side vault unlock.
- **Public wallet dashboard** for Stellar account, XLM, and USDC state.
- **Private wallet dashboard** for shielded USDC notes, note sends, request payments, contacts, activity, and settings.
- **Background batch worker** for larger private payout jobs with durable resume and reconciliation.
- **Private prediction markets** at `/market` with portfolio, market detail, deposits, withdrawals, bets, payouts, and realtime notifications.
- **Admin market console** at `/admin/markets`, restricted by Google email.
- **Realtime UX** using wallet SSE events, notification inbox rows, coalesced refreshes, and bounded toasts.

## Repository Layout

```text
src/app/                       Next.js App Router pages and API routes
src/components/                 Wallet, market, sidebar, header, and UI components
src/lib/                        Client and server helpers
src/lib/server/                 Database repositories, job engine, market logic
db/migrations/                  Supabase/Postgres schema migrations
scripts/                        Migration, deploy, smoke, worker, and market tooling
public/                         Veil logo and landing-page media assets
MARKET_DEPLOYMENT.md            Market deployment and live smoke runbook
railpack.json                   Railway/Railpack service config
```

## Prerequisites

- Node.js 22
- npm
- Supabase Postgres database
- Google OAuth application
- Running Veil backend services:
  - `prover-api`
  - `relayer`
- Deployed Stellar testnet pool contracts from the backend repo

## Environment

Create `.env.local` for local development. Production variables are set in Railway.

Required application and auth variables:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3002
AUTH_URL=http://localhost:3002
NEXTAUTH_URL=http://localhost:3002
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
DATABASE_URL=...
DIRECT_DATABASE_URL=...
```

Required service and chain variables:

```bash
PROVER_API_URL=http://127.0.0.1:3001
RELAYER_URL=http://127.0.0.1:3000
NEXT_PUBLIC_RELAYER_URL=http://127.0.0.1:3000
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_USDC_CONTRACT_ID=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
NEXT_PUBLIC_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

Current wallet pool configuration:

```bash
NEXT_PUBLIC_POOL_ID=CDEB3AIFRAGHGPLM24EDHHETSH4Y4L4NAYGSHHW7MQWXUQ65G7LEDBFY
POOL_ID=CDEB3AIFRAGHGPLM24EDHHETSH4Y4L4NAYGSHHW7MQWXUQ65G7LEDBFY
NEXT_PUBLIC_POOL_DEPLOYMENT_LEDGER=3390591
POOL_DEPLOYMENT_LEDGER=3390591
```

Current market pool configuration:

```bash
MARKET_POOL_ID=veil_market_pool_v1
MARKET_POOL_CONTRACT_ID=CBQ2TULUH6Z2V2JGUSOD2U2G3VUIBJ55XRP3FICJKOETXFXLRBHSH4UW
NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID=CBQ2TULUH6Z2V2JGUSOD2U2G3VUIBJ55XRP3FICJKOETXFXLRBHSH4UW
MARKET_POOL_DEPLOYMENT_LEDGER=3390595
MARKET_POOL_TREE_DEPTH=10
```

Required internal keys:

```bash
INTERNAL_SERVICE_AUTH_TOKEN=...
JOB_EXECUTION_ENCRYPTION_KEY=...
MARKET_ADMIN_EMAIL=abhinavpangaria2003@gmail.com
MARKET_ESCROW_BN254_PUBLIC_HEX=...
MARKET_ESCROW_BN254_PRIVATE_HEX=...
MARKET_ESCROW_X25519_PUBLIC_HEX=...
MARKET_ESCROW_X25519_PRIVATE_HEX=...
MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX=...
```

Do not commit real secrets.

## Local Development

Install dependencies:

```bash
npm install
```

Apply database migrations:

```bash
npm run db:migrate
```

Seed prediction markets:

```bash
npm run db:seed:markets
```

Run the frontend:

```bash
npm run dev
```

The app runs on `http://localhost:3002`.

Run the spend worker locally when testing background batches:

```bash
npm run worker:spend
```

## Verification

Core checks:

```bash
npm test
npm run smoke:check
npm run build
```

Deployment readiness:

```bash
npm run db:check
npm run deploy:check
```

Market-specific tooling:

```bash
npm run proof:market:visual
MARKET_SMOKE_CONFIRM_RESOLVE=demo-settlement-yes npm run smoke:live:market
```

`deploy:check` verifies required env, Supabase schema, app readiness, prover health, and relayer health.

## Deployment

Railway uses `railpack.json` and starts the app through:

```bash
npm run start
```

`scripts/railway-start.mjs` supports two process roles:

- `VEIL_PROCESS=web`: runs `next start`.
- `VEIL_PROCESS=worker`: runs `scripts/spend-worker.mjs`.

The production deployment is split into:

- `veil-client`: web application.
- `veil-worker`: background spend worker using the same client repository.
- `veil-server`: backend prover and relayer service from the backend repository.

Before deploying a fresh environment:

1. Configure Supabase and Google OAuth.
2. Configure Railway variables for the client and worker.
3. Confirm backend `prover-api` and `relayer` are healthy.
4. Run `npm run db:migrate`.
5. Run `npm run db:seed:markets`.
6. Run `npm run deploy:check`.
7. Push to `main`.

## Security And Privacy Notes

- Wallet secret material is encrypted in the browser vault before storage.
- Server-side tables store ciphertext and metadata, not cleartext wallet secrets.
- Background spend packages are encrypted using `JOB_EXECUTION_ENCRYPTION_KEY`.
- Pool privacy is scoped to the note pool. Public deposits and public withdrawals are visible on Stellar.
- This is testnet software and should not be treated as audited production custody infrastructure.

## Related Repositories

- Backend, contracts, prover, and relayer: `Veil.Server.v0`
- Frontend, wallet UI, market UI, worker, and app API routes: `Veil.Client.v0`
