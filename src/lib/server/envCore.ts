export type EnvMap = Record<string, string | undefined>;

export function parseDotEnvText(text: string): EnvMap {
  const parsed: EnvMap = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function mergeEnvWithFallback(primary: EnvMap, fallback: EnvMap): EnvMap {
  const merged: EnvMap = { ...fallback };
  for (const [key, value] of Object.entries(primary)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
