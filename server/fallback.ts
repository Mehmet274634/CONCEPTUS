import fs from 'node:fs';
import path from 'node:path';
import { runCliSeat, type RunCliOptions, type RunCliResult } from './adapters.ts';
import { discoverProviders } from './discovery.ts';
import { getCooldownsPath, getFallbackPolicyPath } from './paths.ts';
import type {
  BlueprintDepth,
  FallbackPolicy,
  PoolCooldown,
  ProviderId,
  ProviderInfo,
} from './types.ts';

const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min circuit breaker

export type JobCaliber = 'flagship' | 'balanced' | 'fast';
export type JobType =
  | 'synthesis'
  | 'debate'
  | 'blueprint_deep'
  | 'blueprint_core'
  | 'blueprint_standard'
  | 'utility';

const CALIBER_RANK: Record<JobCaliber, number> = {
  fast: 1,
  balanced: 2,
  flagship: 3,
};

const DEFAULT_POLICY: FallbackPolicy = {
  mode: 'quality_auto',
  preventDowngrade: true,
};

const cooldowns = new Map<string, PoolCooldown>();
let fallbackPolicy: FallbackPolicy = { ...DEFAULT_POLICY };

function ensureDataDir() {
  const dir = path.dirname(getCooldownsPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadCooldownsFromDisk() {
  cooldowns.clear();
  try {
    const file = getCooldownsPath();
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(raw)) {
      const now = Date.now();
      for (const item of raw) {
        if (item?.pool && item.expiresAt > now) {
          cooldowns.set(item.pool, item);
        }
      }
    }
  } catch {
    // ignore corrupt cooldown file
  }
}

function saveCooldownsToDisk() {
  try {
    ensureDataDir();
    fs.writeFileSync(getCooldownsPath(), JSON.stringify(listActiveCooldowns(), null, 2), 'utf8');
  } catch {
    // ignore
  }
}

function loadPolicyFromDisk() {
  fallbackPolicy = { ...DEFAULT_POLICY };
  try {
    const file = getFallbackPolicyPath();
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && (raw.mode === 'quality_auto' || raw.mode === 'custom' || raw.mode === 'ask')) {
      fallbackPolicy = {
        mode: raw.mode,
        customProvider: raw.customProvider || undefined,
        customModel: raw.customModel || undefined,
        preventDowngrade: raw.preventDowngrade !== false,
      };
    }
  } catch {
    // ignore
  }
}

function savePolicyToDisk() {
  try {
    ensureDataDir();
    fs.writeFileSync(getFallbackPolicyPath(), JSON.stringify(fallbackPolicy, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

export function reloadFallbackStateFromDisk() {
  loadCooldownsFromDisk();
  loadPolicyFromDisk();
}

reloadFallbackStateFromDisk();

export function getFallbackPolicy(): FallbackPolicy {
  return { ...fallbackPolicy };
}

export function setFallbackPolicy(next: Partial<FallbackPolicy>): FallbackPolicy {
  const mode =
    next.mode === 'quality_auto' || next.mode === 'custom' || next.mode === 'ask'
      ? next.mode
      : fallbackPolicy.mode;
  fallbackPolicy = {
    mode,
    customProvider:
      next.customProvider !== undefined ? next.customProvider : fallbackPolicy.customProvider,
    customModel:
      next.customModel !== undefined ? next.customModel : fallbackPolicy.customModel,
    preventDowngrade:
      typeof next.preventDowngrade === 'boolean'
        ? next.preventDowngrade
        : fallbackPolicy.preventDowngrade,
  };
  savePolicyToDisk();
  return getFallbackPolicy();
}

export function getQuotaPoolKey(provider: ProviderId, model: string): string {
  const m = model.toLowerCase();
  if (provider === 'antigravity') {
    if (m.includes('claude')) return 'antigravity:claude';
    if (m.includes('gpt-oss')) return 'antigravity:oss';
    return 'antigravity:gemini';
  }
  return `${provider}:all`;
}

export function isQuotaOrLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('quota') ||
    m.includes('rate_limit') ||
    m.includes('rate limit') ||
    m.includes('usage_limit') ||
    m.includes('weekly limit') ||
    m.includes('limit reached') ||
    m.includes('resets in') ||
    m.includes('429') ||
    m.includes('resource_exhausted') ||
    m.includes('overloaded') ||
    m.includes('capacity') ||
    m.includes('ineligibletier') ||
    m.includes('no longer supported')
  );
}

export function markPoolExhausted(provider: ProviderId, model: string, reason: string) {
  const pool = getQuotaPoolKey(provider, model);
  const now = Date.now();
  cooldowns.set(pool, {
    pool,
    reason: reason.slice(0, 220),
    detectedAt: now,
    expiresAt: now + DEFAULT_COOLDOWN_MS,
  });
  saveCooldownsToDisk();
}

export function isPoolExhausted(provider: ProviderId, model: string): PoolCooldown | null {
  const pool = getQuotaPoolKey(provider, model);
  const entry = cooldowns.get(pool);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cooldowns.delete(pool);
    saveCooldownsToDisk();
    return null;
  }
  return entry;
}

export function listActiveCooldowns(): PoolCooldown[] {
  const now = Date.now();
  const out: PoolCooldown[] = [];
  for (const [k, v] of cooldowns.entries()) {
    if (v.expiresAt > now) out.push(v);
    else cooldowns.delete(k);
  }
  return out;
}

export function clearAllCooldowns() {
  cooldowns.clear();
  saveCooldownsToDisk();
}

export function clearPoolCooldown(pool: string) {
  if (cooldowns.delete(pool)) {
    saveCooldownsToDisk();
  }
}

/**
 * Classifies a model's professional caliber so high-stakes work (Master Karar,
 * core architecture/UX blueprints, flagship debates) is NEVER silently downgraded
 * to weak/low-tier models.
 */
export function getModelCaliber(provider: ProviderId, model: string): JobCaliber {
  const m = model.toLowerCase();
  if (provider === 'codex') {
    if (m.includes('gpt-6') || m.includes('terra') || m === 'default') return 'flagship';
    return 'balanced';
  }
  if (provider === 'claude') {
    if (m.includes('opus')) return 'flagship';
    if (m.includes('haiku')) return 'fast';
    return 'balanced';
  }
  if (provider === 'antigravity') {
    if (
      (m.includes('opus') && !m.endsWith('-low')) ||
      ((m.includes('neon') || m.includes('argon')) && (m.endsWith('-high') || m.endsWith('-xhigh'))) ||
      (m.includes('sonnet') && m.endsWith('-high'))
    ) {
      return 'flagship';
    }
    if (
      m.includes('neon') ||
      m.includes('argon') ||
      m.includes('opus') ||
      (m.includes('sonnet') && !m.endsWith('-low')) ||
      m.includes('flash-high') ||
      m.includes('gpt-oss-120b')
    ) {
      return 'balanced';
    }
    return 'fast';
  }
  if (m.includes('pro')) return 'flagship';
  return 'fast';
}

export function getRequiredCaliber(
  provider: ProviderId,
  model: string,
  tier?: BlueprintDepth,
  jobType?: JobType
): JobCaliber {
  const modelCaliber = getModelCaliber(provider, model);

  let jobCaliber: JobCaliber = 'balanced';
  if (jobType === 'synthesis' || jobType === 'blueprint_deep' || tier === 'deep') {
    jobCaliber = 'flagship';
  } else if (
    jobType === 'debate' ||
    jobType === 'blueprint_core' ||
    jobType === 'blueprint_standard' ||
    tier === 'standard'
  ) {
    jobCaliber = 'balanced';
  } else if (jobType === 'utility' || tier === 'concise') {
    jobCaliber = 'fast';
  }

  return CALIBER_RANK[modelCaliber] >= CALIBER_RANK[jobCaliber]
    ? modelCaliber
    : jobCaliber;
}

interface CandidateEntry {
  provider: ProviderId;
  model: string;
  caliber: JobCaliber;
}

function buildQualityMatchedCandidates(
  providers: ProviderInfo[],
  requiredCaliber: JobCaliber,
  policy: FallbackPolicy
): CandidateEntry[] {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const candidates: CandidateEntry[] = [];
  const seen = new Set<string>();

  const pushIfInstalled = (
    provider: ProviderId,
    modelIds: string[],
    caliber: JobCaliber
  ) => {
    const info = byId.get(provider);
    if (!info || !info.installed) return;
    for (const id of modelIds) {
      if (info.models.some((m) => m.id === id)) {
        const key = `${provider}:${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({ provider, model: id, caliber });
        }
        return;
      }
    }
  };

  // 1. If user chose a Custom Backup Agent, ALWAYS prioritize it first!
  if (policy.mode === 'custom' && policy.customProvider && policy.customModel) {
    const info = byId.get(policy.customProvider);
    if (info?.installed) {
      const key = `${policy.customProvider}:${policy.customModel}`;
      seen.add(key);
      candidates.push({
        provider: policy.customProvider,
        model: policy.customModel,
        caliber: getModelCaliber(policy.customProvider, policy.customModel),
      });
    }
  }

  // 2. Flagship pool (Tier 3 — Master Karar, Kapsamlı MD, Opus/High eşdeğeri)
  if (requiredCaliber === 'flagship') {
    pushIfInstalled('antigravity', ['gemini-4-neon-high', 'gemini-4-argon-high', 'gemini-4-neon-xhigh'], 'flagship');
    pushIfInstalled('codex', ['gpt-6-luna', 'gpt-5.6-terra'], 'flagship');
    pushIfInstalled('antigravity', ['claude-opus-5-5-high', 'claude-opus-5-5-medium'], 'flagship');
    pushIfInstalled('claude', ['opus'], 'flagship');
    // Only add balanced as last resort if preventDowngrade is false
    if (!policy.preventDowngrade) {
      pushIfInstalled('antigravity', ['gemini-4-neon-medium', 'gemini-4-argon-medium'], 'balanced');
      pushIfInstalled('codex', ['gpt-5.6-luna'], 'balanced');
    }
  }

  // 3. Balanced / Professional pool (Tier 2 — Tartışma, Standart & Çekirdek MD'ler)
  if (requiredCaliber === 'balanced') {
    pushIfInstalled('antigravity', ['gemini-4-neon-medium', 'gemini-4-argon-medium', 'gemini-4-neon-low'], 'balanced');
    pushIfInstalled('codex', ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.6-terra'], 'balanced');
    pushIfInstalled('antigravity', ['claude-sonnet-5-5-medium', 'claude-opus-5-5-low'], 'balanced');
    pushIfInstalled('claude', ['sonnet', 'opus'], 'balanced');
    pushIfInstalled('antigravity', ['gpt-oss-120b-medium'], 'balanced');
    if (!policy.preventDowngrade) {
      pushIfInstalled('antigravity', ['gemini-3.8-flash-high', 'gemini-3.8-flash-medium'], 'fast');
    }
  }

  // 4. Fast / Utility pool (Tier 1 — ama yine de kaliteli modeller önde)
  if (requiredCaliber === 'fast') {
    pushIfInstalled('antigravity', ['gemini-4-neon-low', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low'], 'fast');
    pushIfInstalled('codex', ['gpt-5.6-luna', 'gpt-6-luna'], 'balanced');
    pushIfInstalled('antigravity', ['claude-sonnet-5-5-low', 'claude-sonnet-5-5-medium'], 'fast');
    pushIfInstalled('antigravity', ['gpt-oss-120b-medium'], 'balanced');
    pushIfInstalled('claude', ['sonnet', 'haiku'], 'fast');
  }

  return candidates;
}

export interface FallbackNotice {
  fromProvider: ProviderId;
  fromModel: string;
  toProvider: ProviderId;
  toModel: string;
  reason: string;
  caliber: JobCaliber;
}

export interface ResilientRunOptions extends RunCliOptions {
  tier?: BlueprintDepth;
  jobType?: JobType;
  /** When true, bypasses auto-switch (e.g., user explicitly selected this exact model on manual retry) */
  strictSelection?: boolean;
  onFallback?: (notice: FallbackNotice) => void;
}

export interface ResilientRunResult extends RunCliResult {
  usedProvider: ProviderId;
  usedModel: string;
  fallbackNotice?: FallbackNotice;
}

export async function runCliSeatWithFallback(
  options: ResilientRunOptions
): Promise<ResilientRunResult> {
  const policy = getFallbackPolicy();
  const requiredCaliber = getRequiredCaliber(
    options.provider,
    options.model,
    options.tier,
    options.jobType
  );
  const providers = await discoverProviders(false);
  const allCandidates = buildQualityMatchedCandidates(providers, requiredCaliber, policy);

  const allowAutoSwitch = !options.strictSelection && policy.mode !== 'ask';

  const triedPools = new Set<string>();
  let currentProvider = options.provider;
  let currentModel = options.model;
  let fallbackNotice: FallbackNotice | undefined;

  // Proactive check: if requested pool is ALREADY known exhausted and auto-switch is allowed
  const knownExhausted = isPoolExhausted(currentProvider, currentModel);
  if (knownExhausted && allowAutoSwitch) {
    triedPools.add(getQuotaPoolKey(currentProvider, currentModel));
    const healthy = allCandidates.find(
      (c) =>
        !triedPools.has(getQuotaPoolKey(c.provider, c.model)) &&
        !isPoolExhausted(c.provider, c.model)
    );
    if (healthy) {
      fallbackNotice = {
        fromProvider: currentProvider,
        fromModel: currentModel,
        toProvider: healthy.provider,
        toModel: healthy.model,
        reason: knownExhausted.reason,
        caliber: requiredCaliber,
      };
      currentProvider = healthy.provider;
      currentModel = healthy.model;
      options.onFallback?.(fallbackNotice);
    }
  }

  const MAX_ATTEMPTS = allowAutoSwitch ? 3 : 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    triedPools.add(getQuotaPoolKey(currentProvider, currentModel));

    try {
      const res = await runCliSeat({
        ...options,
        provider: currentProvider,
        model: currentModel,
      });

      return {
        ...res,
        usedProvider: currentProvider,
        usedModel: currentModel,
        fallbackNotice,
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg === 'ABORTED' || options.signal.aborted) {
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(msg);

      if (!isQuotaOrLimitError(msg)) {
        throw lastError;
      }

      // Mark exhausted pool so parallel & future jobs immediately know it's out of quota
      markPoolExhausted(currentProvider, currentModel, msg);

      if (!allowAutoSwitch) {
        throw new Error(
          `${currentProvider}/${currentModel} kotası doldu (${msg}). Yedek kuralı "Bana Sor" modunda olduğu için otomatik geçiş yapılmadı — istediğin modeli seçip tamamlayabilirsin.`
        );
      }

      // Pick next healthy candidate from a different quota pool matching required professionalism
      const next = allCandidates.find(
        (c) =>
          !triedPools.has(getQuotaPoolKey(c.provider, c.model)) &&
          !isPoolExhausted(c.provider, c.model)
      );

      if (!next) {
        throw new Error(
          `${currentProvider}/${currentModel} kotası doldu ve işin kalite seviyesine (${requiredCaliber}) uygun başka çalışan yedek havuz bulunamadı. Sağ panelden özel yedek model seçebilirsin.`
        );
      }

      fallbackNotice = {
        fromProvider: options.provider,
        fromModel: options.model,
        toProvider: next.provider,
        toModel: next.model,
        reason: msg,
        caliber: requiredCaliber,
      };
      currentProvider = next.provider;
      currentModel = next.model;
      options.onFallback?.(fallbackNotice);
    }
  }

  throw lastError || new Error('Uygun yedek model bulunamadı.');
}
