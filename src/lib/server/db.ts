import "server-only";

import { Pool } from "pg";

import {
  getDatabaseUrl,
  type DatabaseEnv,
  type DatabaseUrlOptions,
} from "./databaseUrl";
import { getWalletServerEnv } from "./serverEnv";

let pooledPool: Pool | null = null;
let directPool: Pool | null = null;

export { getDatabaseUrl };

export function createPgPool(
  env: DatabaseEnv = getWalletServerEnv(),
  options: DatabaseUrlOptions = {},
): Pool {
  return new Pool({
    connectionString: getDatabaseUrl(env, options),
    max: options.direct ? 1 : 5,
  });
}

export function getPgPool(options: DatabaseUrlOptions = {}): Pool {
  if (options.direct) {
    directPool ??= createPgPool(getWalletServerEnv(), { direct: true });
    return directPool;
  }

  pooledPool ??= createPgPool(getWalletServerEnv());
  return pooledPool;
}
