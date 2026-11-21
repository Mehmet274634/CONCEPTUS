import path from 'node:path';

export function getDataDir(): string {
  const envDir = process.env.CONCEPTUS_DATA_DIR?.trim();
  if (envDir) return path.resolve(envDir);
  return path.resolve(process.cwd(), 'data');
}

export function getSessionsDir(): string {
  return path.join(getDataDir(), 'sessions');
}

export function getExportsDir(): string {
  const envDir = process.env.CONCEPTUS_EXPORTS_DIR?.trim();
  if (envDir) return path.resolve(envDir);
  return path.resolve(process.cwd(), 'exports');
}

export function getProvidersCachePath(): string {
  return path.join(getDataDir(), 'providers-cache.json');
}

export function getCooldownsPath(): string {
  return path.join(getDataDir(), 'quota-cooldowns.json');
}

export function getFallbackPolicyPath(): string {
  return path.join(getDataDir(), 'fallback-policy.json');
}
