import { runCliSeat } from './adapters.ts';
import {
  clearPoolCooldown,
  isPoolExhausted,
  isQuotaOrLimitError,
  markPoolExhausted,
} from './fallback.ts';
import type { ProviderId, ProviderInfo, ProviderPoolHealth } from './types.ts';

interface PoolSpec {
  pool: string;
  provider: ProviderId;
  label: string;
  preferredModels: string[];
}

const POOL_SPECS: PoolSpec[] = [
  {
    pool: 'antigravity:gemini',
    provider: 'antigravity',
    label: 'Antigravity · Gemini',
    preferredModels: ['gemini-3.8-flash-low', 'gemini-4-neon-low', 'gemini-4-neon-medium', 'auto'],
  },
  {
    pool: 'antigravity:claude',
    provider: 'antigravity',
    label: 'Antigravity · Claude',
    preferredModels: ['claude-sonnet-5-5-low', 'claude-opus-5-5-low', 'claude-sonnet-5-5-medium'],
  },
  {
    pool: 'codex:all',
    provider: 'codex',
    label: 'Codex CLI',
    preferredModels: ['gpt-5.6-luna', 'gpt-6-luna', 'default'],
  },
  {
    pool: 'claude:all',
    provider: 'claude',
    label: 'Claude Code',
    preferredModels: ['haiku', 'sonnet', 'default'],
  },
  {
    pool: 'gemini:all',
    provider: 'gemini',
    label: 'Gemini CLI',
    preferredModels: ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'auto'],
  },
];

interface CachedProbe {
  status: ProviderPoolHealth['status'];
  latencyMs?: number;
  detail?: string;
  resetHint?: string;
  checkedAt: number;
}

const probeCache = new Map<string, CachedProbe>();
const PROBE_TTL_MS = 10 * 60 * 1000;

function pickSampleModel(info: ProviderInfo | undefined, preferred: string[]): string {
  if (!info || info.models.length === 0) return preferred[0] || 'auto';
  for (const id of preferred) {
    if (info.models.some((m) => m.id === id)) return id;
  }
  return info.models[0].id;
}

export function extractResetHint(message: string): string | undefined {
  const m = message || '';
  const resetsIn = m.match(/resets?\s+in\s+([0-9]+\s*(?:h|hr|hour|hours|m|min|mins|minute|minutes|d|day|days)(?:\s*[0-9]+\s*(?:m|min|mins|s|sec))?)/i);
  if (resetsIn) return `Yenilenme: ${resetsIn[1].trim()}`;
  const tryAgain = m.match(/try\s+again\s+in\s+([0-9]+\s*(?:h|m|s|minute|minutes|hour|hours|seconds?))/i);
  if (tryAgain) return `Tekrar dene: ${tryAgain[1].trim()}`;
  if (/weekly\s+limit/i.test(m)) return 'Haftalık limit doldu';
  if (/daily\s+limit/i.test(m)) return 'Günlük limit doldu';
  return undefined;
}

function isAuthError(message: string): boolean {
  const lower = (message || '').toLowerCase();
  return (
    lower.includes('not logged in') ||
    lower.includes('unauthorized') ||
    lower.includes('authentication') ||
    lower.includes('please login') ||
    lower.includes('run `claude login`') ||
    lower.includes('codex login') ||
    lower.includes('401')
  );
}

/**
 * 0-Token instant snapshot of every quota pool's real known health:
 * combines CLI installation, CLI auth/plan status, active quota circuit-breaker cooldowns,
 * and recent live probe results (if run within the last 10 min).
 */
export function getProviderPoolsHealth(providers: ProviderInfo[]): ProviderPoolHealth[] {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const now = Date.now();

  return POOL_SPECS.map((spec) => {
    const info = byId.get(spec.provider);
    const installed = Boolean(info?.installed);
    const sampleModel = pickSampleModel(info, spec.preferredModels);

    if (!installed) {
      return {
        pool: spec.pool,
        provider: spec.provider,
        label: spec.label,
        sampleModel,
        installed: false,
        status: 'offline',
        detail: 'Kurulu değil',
      };
    }

    if (info?.authStatus && !info.authStatus.loggedIn) {
      return {
        pool: spec.pool,
        provider: spec.provider,
        label: spec.label,
        sampleModel,
        installed: true,
        status: 'auth_required',
        planLabel: info.authStatus.planLabel,
        detail: 'Oturum açılmamış',
      };
    }

    const cooldown = isPoolExhausted(spec.provider, sampleModel);
    if (cooldown) {
      const remMin = Math.max(1, Math.ceil((cooldown.expiresAt - now) / 60_000));
      return {
        pool: spec.pool,
        provider: spec.provider,
        label: spec.label,
        sampleModel,
        installed: true,
        status: 'limited',
        planLabel: info?.authStatus?.planLabel,
        detail: cooldown.reason,
        resetHint: extractResetHint(cooldown.reason) || `~${remMin} dk kilitli`,
        checkedAt: cooldown.detectedAt,
        expiresAt: cooldown.expiresAt,
      };
    }

    const cached = probeCache.get(spec.pool);
    if (cached && now - cached.checkedAt < PROBE_TTL_MS) {
      return {
        pool: spec.pool,
        provider: spec.provider,
        label: spec.label,
        sampleModel,
        installed: true,
        status: cached.status,
        planLabel: info?.authStatus?.planLabel,
        latencyMs: cached.latencyMs,
        detail: cached.detail,
        resetHint: cached.resetHint,
        checkedAt: cached.checkedAt,
      };
    }

    return {
      pool: spec.pool,
      provider: spec.provider,
      label: spec.label,
      sampleModel,
      installed: true,
      status: 'unknown',
      planLabel: info?.authStatus?.planLabel,
      detail: 'Hazır (test edilmedi)',
    };
  });
}

/**
 * Live parallel ultra-lightweight quota probe (1-word "OK" ping per installed pool).
 * Gives the user 100% real verification of which pools have live quota BEFORE starting a session!
 */
export async function probeProviderPools(
  providers: ProviderInfo[],
  targetPools?: string[]
): Promise<ProviderPoolHealth[]> {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const specsToTest = POOL_SPECS.filter((s) => {
    const info = byId.get(s.provider);
    if (!info?.installed) return false;
    if (info.authStatus && !info.authStatus.loggedIn) return false;
    if (targetPools && targetPools.length > 0 && !targetPools.includes(s.pool)) return false;
    return true;
  });

  await Promise.all(
    specsToTest.map(async (spec) => {
      const info = byId.get(spec.provider)!;
      const sampleModel = pickSampleModel(info, spec.preferredModels);
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 18_000);
      const started = Date.now();

      try {
        await runCliSeat({
          provider: spec.provider,
          model: sampleModel,
          effort: 'low',
          prompt:
            '[READ-ONLY PING: Do not call any tools. Reply with the single word OK.]',
          signal: ctrl.signal,
          onDelta: () => {},
        });
        const latencyMs = Date.now() - started;
        clearPoolCooldown(spec.pool);
        probeCache.set(spec.pool, {
          status: 'ready',
          latencyMs,
          detail: `Aktif (${(latencyMs / 1000).toFixed(1)}s)`,
          checkedAt: Date.now(),
        });
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (isQuotaOrLimitError(msg)) {
          markPoolExhausted(spec.provider, sampleModel, msg);
          probeCache.set(spec.pool, {
            status: 'limited',
            detail: msg.slice(0, 180),
            resetHint: extractResetHint(msg),
            checkedAt: Date.now(),
          });
        } else if (isAuthError(msg)) {
          probeCache.set(spec.pool, {
            status: 'auth_required',
            detail: 'Oturum süresi dolmuş veya giriş yapılmamış',
            checkedAt: Date.now(),
          });
        } else if (ctrl.signal.aborted || msg === 'ABORTED') {
          probeCache.set(spec.pool, {
            status: 'unknown',
            detail: 'Yanıt zaman aşımına uğradı (18s)',
            checkedAt: Date.now(),
          });
        } else {
          probeCache.set(spec.pool, {
            status: 'unknown',
            detail: msg.slice(0, 140),
            checkedAt: Date.now(),
          });
        }
      } finally {
        clearTimeout(timeoutId);
      }
    })
  );

  return getProviderPoolsHealth(providers);
}
