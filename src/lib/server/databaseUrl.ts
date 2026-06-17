export interface DatabaseEnv {
  DATABASE_URL?: string;
  DIRECT_DATABASE_URL?: string;
  [key: string]: string | undefined;
}

export interface DatabaseUrlOptions {
  direct?: boolean;
}

export function getDatabaseUrl(
  env: DatabaseEnv = process.env,
  options: DatabaseUrlOptions = {},
): string {
  const key = options.direct ? "DIRECT_DATABASE_URL" : "DATABASE_URL";
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required for Wallet V2 database access`);
  }
  return value;
}
