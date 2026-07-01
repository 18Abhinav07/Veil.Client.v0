---
created: 2026-06-30
project: private-payments-archive
ecosystem: stellar
tags: [prediction-market, deployment, smoke-test, admin]
---

# Market Deployment Runbook

Links: [[HANDOFF]] [[validation/spike-results]]

This page covers the standalone private prediction market at `/market` and the admin page at `/admin/markets`.

## Required Environment

Market pool:

- `MARKET_POOL_ID`: database pool id, for example `veil_market_pool_v1`.
- `MARKET_POOL_CONTRACT_ID`: deployed market pool contract id. Use the market pool, not the wallet pool.
- `NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID`: optional browser-visible mirror when needed by client code.
- `MARKET_POOL_DEPLOYMENT_LEDGER`: deployment ledger used for event indexing.
- `MARKET_POOL_TREE_DEPTH`: defaults to `10` for the currently deployed circuit. Do not set `15` until a matching 15-depth circuit, proving key, verifier, prover, and relayer stack is deployed.
- `MARKET_POOL_DEPLOYER_KEY_ID`: non-secret identifier for the deployer key. Reuse the previous wallet-pool deployer key policy without exposing secret material.

Market escrow keys:

- `MARKET_ESCROW_BN254_PUBLIC_HEX`
- `MARKET_ESCROW_X25519_PUBLIC_HEX`
- `MARKET_ESCROW_BN254_PRIVATE_HEX`
- `MARKET_ESCROW_X25519_PRIVATE_HEX`
- `MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX`

Admin/auth:

- `MARKET_ADMIN_EMAIL`: optional override. Defaults to `abhinavpangaria2003@gmail.com`.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, and the existing Auth.js/Postgres env must be configured.

Core services:

- `PROVER_API_URL`
- `RELAYER_URL`
- `DATABASE_URL`
- `DIRECT_DATABASE_URL`

## Deploy Order

1. Apply database migrations:

```bash
npm run db:migrate
```

2. Seed markets and market pool metadata:

```bash
npm run db:seed:markets
```

3. Check schema, env, app readiness, prover readiness, and relayer readiness:

```bash
npm run deploy:check
```

4. Run syntax checks:

```bash
npm run smoke:check
```

5. Build the app:

```bash
npm run build
```

## Live Market Smoke

Use the controlled demo market for destructive end-to-end payout testing. Do not run this against a 14-21 day production market unless the market is meant to be resolved.

Required inputs:

- `MARKET_SMOKE_USER_COOKIE`: full browser `Cookie` header for the user test account.
- `MARKET_SMOKE_ADMIN_COOKIE`: full browser `Cookie` header for the admin account.
- `MARKET_SMOKE_USER_WALLET_JSON`: wallet secret JSON for the same user test account. This can be inline JSON or a local path.
- `MARKET_SMOKE_CONFIRM_RESOLVE=demo-settlement-yes`: explicit guard that allows admin resolution.

Optional inputs:

- `FRONTEND_URL`: defaults to `http://localhost:3002`.
- `MARKET_SMOKE_MARKET_SLUG`: defaults to `demo-settlement-yes`.
- `MARKET_SMOKE_DEPOSIT_USDC`: defaults to `5`.
- `MARKET_SMOKE_STAKE_USDC`: defaults to `1`.
- `MARKET_SMOKE_OUTCOME`: defaults to `YES`.
- `MARKET_SMOKE_EVIDENCE_PATH`: defaults to `market-smoke-evidence.json`.

Run:

```bash
MARKET_SMOKE_CONFIRM_RESOLVE=demo-settlement-yes npm run smoke:live:market
```

The script performs the real flow:

1. User market deposit prepare, submit, finalize, and store.
2. User private bet escrow prepare, submit, and finalize.
3. Admin resolve.
4. Admin execute payout.
5. User claim payout note.
6. Evidence JSON write with deposit, bet, payout, and claim ids.

## Manual Browser Proof

After live smoke passes, browser-check:

- `/market`: markets list, detail navigation, market deposit, private bet, payout claim state.
- `/market/[slug]`: vault-gated deposit and bet flow.
- `/admin/markets`: Google admin gate, seed, close, cancel, resolve, load payouts, execute payouts.

The admin page must only render the console for the configured admin Google account.
