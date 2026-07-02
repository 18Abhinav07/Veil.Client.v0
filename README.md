<p align="center">
  <img src="./public/Veil_Logo.png" alt="Veil private wallet" width="420" />
</p>

<h1 align="center">Private USDC Wallet</h1>

<p align="center">
  Veil is a private payments and prediction market wallet built on Stellar testnet privacy pools.
</p>

<p align="center">
  <strong>Next.js</strong> | <strong>Supabase</strong> | <strong>Google Auth</strong> | <strong>Stellar Testnet</strong>
</p>

## Overview

This repository contains the Veil client application: the authenticated wallet interface, encrypted browser vault, private note portfolio, payment workflows, prediction market portfolio, realtime activity feed, notification system, and background spend-worker entrypoint.

Veil has two private USDC lanes:

| Lane | Purpose |
| --- | --- |
| Wallet notes | Deposit public USDC into private notes, send privately, batch pay recipients, receive notes, and withdraw back to the public wallet. |
| Market notes | Deposit public USDC into market notes, place private YES/NO positions, receive private payouts, claim payout notes, and withdraw unused market notes. |

The current deployment target is Stellar testnet.

## Product Capabilities

| Area | What it provides |
| --- | --- |
| Authentication | Google sign-in with an encrypted client-side vault unlock flow. |
| Public wallet | Stellar account state, XLM balance, USDC trustline state, and public deposit readiness. |
| Private wallet | Shielded USDC note cards, note-to-note transfers, private sends, withdrawals, requests, contacts, activity, and settings. |
| Batch payments | Durable background execution for multi-recipient private payouts with resume and reconciliation support. |
| Prediction markets | Private market deposits, YES/NO positions, market note balances, payout claims, and portfolio views. |
| Realtime state | Server-sent wallet events, notification inbox rows, coalesced refreshes, and bounded toasts for long-running actions. |

## Architecture

| Layer | Responsibility |
| --- | --- |
| Browser vault | Holds user wallet material after password unlock. Secrets are encrypted before storage. |
| Next.js app | Renders wallet, market, activity, settings, and API routes. |
| Supabase Postgres | Stores users, encrypted wallet records, note metadata, jobs, market records, notifications, and activity events. |
| Spend worker | Processes queued background payment jobs through the same application codebase. |
| Prover API | Builds deposit, withdraw, and transfer proofs from backend circuit artifacts. |
| Relayer | Simulates, signs, and submits prepared pool transactions to Stellar. |

## Repository Map

```text
src/app/                       Next.js App Router pages and API routes
src/components/                 Wallet, market, shell, header, and shared UI components
src/lib/                        Client helpers and shared utilities
src/lib/server/                 Server repositories, job engine, market logic, and notification helpers
db/migrations/                  Supabase/Postgres schema migrations
scripts/                        Migration, deployment, smoke, seed, and worker tooling
public/                         Veil brand and landing media assets
MARKET_DEPLOYMENT.md            Market deployment and smoke-test runbook
railpack.json                   Railway/Railpack process configuration
```

## Prerequisites

- Node.js 22
- npm
- Supabase Postgres
- Google OAuth client
- Running Veil backend services:
  - `prover-api`
  - `relayer`
- Deployed Stellar testnet contracts from `Veil.Server.v0`

## Environment

Create `.env.local` for local development. Production variables are configured in Railway.

Application and auth:

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

Services and Stellar:

```bash
PROVER_API_URL=http://127.0.0.1:3001
RELAYER_URL=http://127.0.0.1:3000
NEXT_PUBLIC_RELAYER_URL=http://127.0.0.1:3000
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_USDC_CONTRACT_ID=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
NEXT_PUBLIC_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

Wallet pool:

```bash
NEXT_PUBLIC_POOL_ID=CDEB3AIFRAGHGPLM24EDHHETSH4Y4L4NAYGSHHW7MQWXUQ65G7LEDBFY
POOL_ID=CDEB3AIFRAGHGPLM24EDHHETSH4Y4L4NAYGSHHW7MQWXUQ65G7LEDBFY
NEXT_PUBLIC_POOL_DEPLOYMENT_LEDGER=3390591
POOL_DEPLOYMENT_LEDGER=3390591
```

Market pool:

```bash
MARKET_POOL_ID=veil_market_pool_v1
MARKET_POOL_CONTRACT_ID=CBQ2TULUH6Z2V2JGUSOD2U2G3VUIBJ55XRP3FICJKOETXFXLRBHSH4UW
NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID=CBQ2TULUH6Z2V2JGUSOD2U2G3VUIBJ55XRP3FICJKOETXFXLRBHSH4UW
MARKET_POOL_DEPLOYMENT_LEDGER=3390595
MARKET_POOL_TREE_DEPTH=10
```

Internal execution keys:

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

Run the app:

```bash
npm run dev
```

The local client runs on `http://localhost:3002`.

Run the background worker when testing queued private payments:

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

Market smoke tooling:

```bash
npm run proof:market:visual
MARKET_SMOKE_CONFIRM_RESOLVE=demo-settlement-yes npm run smoke:live:market
```

`deploy:check` verifies required environment variables, Supabase schema state, app readiness, prover health, and relayer health.

## Deployment

Railway uses `railpack.json` and starts the repository through:

```bash
npm run start
```

`scripts/railway-start.mjs` supports two process roles:

| Role | Behavior |
| --- | --- |
| `VEIL_PROCESS=web` | Runs `next start`. |
| `VEIL_PROCESS=worker` | Runs `scripts/spend-worker.mjs`. |

Recommended production services:

| Service | Repository | Role |
| --- | --- | --- |
| `veil-client` | `Veil.Client.v0` | Web application |
| `veil-worker` | `Veil.Client.v0` | Background spend worker |
| `veil-server` | `Veil.Server.v0` | Prover API and relayer |

Before deployment:

1. Configure Supabase and Google OAuth.
2. Configure Railway variables for the client and worker.
3. Confirm backend `prover-api` and `relayer` health.
4. Run `npm run db:migrate`.
5. Run `npm run db:seed:markets`.
6. Run `npm run deploy:check`.
7. Push to `main`.

## Security And Privacy

- Wallet secret material is encrypted in the browser vault before storage.
- Server tables store ciphertext and metadata, not cleartext wallet secrets.
- Background spend packages are encrypted with `JOB_EXECUTION_ENCRYPTION_KEY`.
- Pool privacy applies inside the note pool. Public deposits and public withdrawals remain visible on Stellar.
- This is testnet software and should not be treated as audited custody infrastructure.

## Related Repositories

- Backend, contracts, prover, and relayer: `Veil.Server.v0`
- Frontend, wallet UI, market UI, worker, and app API routes: `Veil.Client.v0`
