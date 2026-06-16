import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    NEXT_PUBLIC_STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
    NEXT_PUBLIC_RELAYER_URL: process.env.RELAYER_URL ?? "http://127.0.0.1:3000",
    NEXT_PUBLIC_POOL_ID:
      process.env.NEXT_PUBLIC_POOL_ID ??
      process.env.POOL_ID ??
      "CCGTSXKMJUMPKKCZY7JMW4266XVLYCRM6I7ZIFWVGQBIDSGM7SVMAWXD",
    NEXT_PUBLIC_POOL_DEPLOYMENT_LEDGER:
      process.env.NEXT_PUBLIC_POOL_DEPLOYMENT_LEDGER ??
      process.env.POOL_DEPLOYMENT_LEDGER ??
      "3348076",
  },
  // Prover-api is called server-side only — no browser env leak.
  serverExternalPackages: [
    "@stellar/stellar-sdk",
    "@stellar/stellar-base",
    "require-addon",
    "sodium-native",
  ],
};

export default nextConfig;
