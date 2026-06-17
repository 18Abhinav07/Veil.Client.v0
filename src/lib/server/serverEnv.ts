import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mergeEnvWithFallback, parseDotEnvText, type EnvMap } from "./envCore";

let cachedArchiveEnv: EnvMap | null = null;

function readArchiveBackendEnv(): EnvMap {
  if (cachedArchiveEnv) return cachedArchiveEnv;
  try {
    cachedArchiveEnv = parseDotEnvText(
      readFileSync(join(process.cwd(), "..", "backend", ".env"), "utf8"),
    );
  } catch {
    cachedArchiveEnv = {};
  }
  return cachedArchiveEnv;
}

export function getWalletServerEnv(env: EnvMap = process.env): EnvMap {
  return mergeEnvWithFallback(env, readArchiveBackendEnv());
}
