import { Brain, Scale, Zap } from 'lucide-react';
import {
  getQuotaPoolKey,
  type BlueprintDepth,
  type BlueprintFileSpec,
  type FallbackPolicy,
  type PoolCooldown,
  type ProviderId,
  type ProviderInfo,
} from '../types.ts';

export const DEPTH_OPTIONS: {
  id: BlueprintDepth;
  label: string;
  hint: string;
  tierLabel: string;
  icon: typeof Zap;
}[] = [
  {
    id: 'concise',
    label: 'Hızlı & Keskin',
    hint: '~35–55 sn · Hızlı modeller (Flash / Sonnet Low)',
    tierLabel: 'Hızlı katman',
    icon: Zap,
  },
  {
    id: 'standard',
    label: 'Standart',
    hint: '~1–2 dk · Dengeli modeller (Neon Med / Sonnet Med)',
    tierLabel: 'Dengeli katman',
    icon: Scale,
  },
  {
    id: 'deep',
    label: 'Kapsamlı',
    hint: '~3–5 dk · En güçlü modeller (Neon High / Opus High)',
    tierLabel: 'Maksimum kalite',
    icon: Brain,
  },
];

function findFirstModel(
  info: ProviderInfo | undefined,
  candidates: string[],
  exhausted?: Set<string>
): string | undefined {
  if (!info || !info.installed) return undefined;
  for (const id of candidates) {
    if (
      info.models.some((m) => m.id === id) &&
      (!exhausted || !exhausted.has(getQuotaPoolKey(info.id, id)))
    ) {
      return id;
    }
  }
  const anyHealthy = info.models.find(
    (m) => !exhausted || !exhausted.has(getQuotaPoolKey(info.id, m.id))
  );
  return anyHealthy?.id || info.models[1]?.id || info.models[0]?.id;
}

export function pickWriterForDepth(
  providers: ProviderInfo[],
  depth: BlueprintDepth,
  cooldowns: PoolCooldown[] = []
): { provider: ProviderId; model: string } {
  const exhausted = new Set(cooldowns.map((c) => c.pool));
  const agy = providers.find((p) => p.id === 'antigravity' && p.installed);
  const claude = providers.find((p) => p.id === 'claude' && p.installed);
  const codex = providers.find((p) => p.id === 'codex' && p.installed);

  if (agy) {
    const prefs: Record<BlueprintDepth, string[]> = {
      concise: [
        'gemini-3.8-flash-low',
        'gemini-3.8-flash-medium',
        'gemini-4-neon-low',
        'claude-sonnet-5-5-low',
      ],
      standard: [
        'gemini-4-neon-medium',
        'gemini-4-argon-medium',
        'claude-sonnet-5-5-medium',
        'gemini-3.8-flash-high',
      ],
      deep: [
        'gemini-4-neon-high',
        'claude-opus-5-5-high',
        'gemini-4-neon-xhigh',
        'gemini-4-argon-high',
      ],
    };
    const model = findFirstModel(agy, prefs[depth], exhausted);
    if (model && !exhausted.has(getQuotaPoolKey('antigravity', model))) {
      return { provider: 'antigravity', model };
    }
  }

  if (codex && !exhausted.has('codex:all')) {
    const model =
      depth === 'concise'
        ? findFirstModel(codex, ['gpt-5.6-luna', 'gpt-6-luna'], exhausted) || 'default'
        : findFirstModel(codex, ['gpt-6-luna', 'gpt-5.6-terra'], exhausted) || 'default';
    return { provider: 'codex', model };
  }

  if (claude && !exhausted.has('claude:all')) {
    const model = depth === 'deep' ? 'opus' : depth === 'concise' ? 'haiku' : 'sonnet';
    return { provider: 'claude', model };
  }

  const first = providers.find((p) => p.installed) || providers[0];
  return {
    provider: (first?.id || 'antigravity') as ProviderId,
    model: first?.models[1]?.id || first?.models[0]?.id || 'auto',
  };
}

export function autoAssignSpecialistModels(
  specs: BlueprintFileSpec[],
  providers: ProviderInfo[],
  depth: BlueprintDepth,
  fallback: { provider: ProviderId; model: string },
  cooldowns: PoolCooldown[] = []
): BlueprintFileSpec[] {
  const exhausted = new Set(cooldowns.map((c) => c.pool));
  const isHealthy = (p: ProviderId, m: string) =>
    !exhausted.has(getQuotaPoolKey(p, m));

  const agy = providers.find((p) => p.id === 'antigravity' && p.installed);
  const codex = providers.find((p) => p.id === 'codex' && p.installed);
  const claude = providers.find((p) => p.id === 'claude' && p.installed);

  const archPrefs: Record<BlueprintDepth, string[]> = {
    concise: ['gemini-3.8-flash-low', 'gemini-3.8-flash-medium', 'gemini-4-neon-low'],
    standard: ['gemini-4-neon-medium', 'gemini-4-argon-medium', 'gemini-3.8-flash-high'],
    deep: ['gemini-4-neon-high', 'gemini-4-neon-xhigh', 'gemini-4-argon-high'],
  };

  const securityPrefs: Record<BlueprintDepth, string[]> = {
    concise: ['claude-sonnet-5-5-low', 'claude-sonnet-5-5-medium', 'gemini-4-neon-low'],
    standard: ['claude-sonnet-5-5-medium', 'claude-opus-5-5-low', 'gemini-4-neon-medium'],
    deep: ['claude-opus-5-5-high', 'claude-opus-5-5-medium', 'gemini-4-neon-high'],
  };

  const codexPrefs: Record<BlueprintDepth, string[]> = {
    concise: ['gpt-5.6-luna', 'gpt-6-luna', 'gpt-5.6-terra'],
    standard: ['gpt-6-luna', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    deep: ['gpt-6-luna', 'gpt-5.6-terra'],
  };

  const archModel = agy ? findFirstModel(agy, archPrefs[depth], exhausted) : undefined;
  const archPick =
    archModel && isHealthy('antigravity', archModel)
      ? { provider: 'antigravity' as ProviderId, model: archModel }
      : fallback;

  const secModel = agy ? findFirstModel(agy, securityPrefs[depth], exhausted) : undefined;
  const securityPick =
    secModel && isHealthy('antigravity', secModel)
      ? { provider: 'antigravity' as ProviderId, model: secModel }
      : claude && isHealthy('claude', depth === 'deep' ? 'opus' : 'sonnet')
        ? { provider: 'claude' as ProviderId, model: depth === 'deep' ? 'opus' : 'sonnet' }
        : codex && isHealthy('codex', 'gpt-6-luna')
          ? { provider: 'codex' as ProviderId, model: findFirstModel(codex, codexPrefs[depth], exhausted) || 'gpt-6-luna' }
          : archPick;

  const roadmapPick =
    codex && !exhausted.has('codex:all')
      ? { provider: 'codex' as ProviderId, model: findFirstModel(codex, codexPrefs[depth], exhausted) || 'default' }
      : archPick;

  return specs.map((spec) => {
    const name = spec.filename.toUpperCase();
    let pick = archPick;
    if (/UX|DESIGN|SCREEN|VISION|SECURITY|RISK|KVKK|DECISION|SPEC|STRATEGY/.test(name)) {
      pick = securityPick;
    } else if (/ROADMAP|QA|BRIEF|START_HERE|ACTION|MVP|PLAYBOOK/.test(name)) {
      pick = roadmapPick;
    }
    return {
      ...spec,
      assignedProvider: pick.provider,
      assignedModel: pick.model,
    };
  });
}

export function pickAuditorModel(
  providers: ProviderInfo[],
  writerModel: string,
  cooldowns: PoolCooldown[] = []
): { provider: ProviderId; model: string } {
  const exhausted = new Set(cooldowns.map((c) => c.pool));
  const agy = providers.find((p) => p.id === 'antigravity' && p.installed);
  if (agy) {
    const prefer = writerModel.includes('claude')
      ? ['gemini-4-neon-low', 'gemini-3.8-flash-medium']
      : ['claude-sonnet-5-5-low', 'claude-sonnet-5-5-medium', 'gemini-4-neon-low'];
    for (const m of prefer) {
      if (
        agy.models.some((x) => x.id === m) &&
        !exhausted.has(getQuotaPoolKey('antigravity', m))
      ) {
        return { provider: 'antigravity', model: m };
      }
    }
  }
  const codex = providers.find((p) => p.id === 'codex' && p.installed);
  if (codex && !exhausted.has('codex:all')) {
    return { provider: 'codex', model: codex.models[1]?.id || 'default' };
  }
  return pickWriterForDepth(providers, 'concise', cooldowns);
}

export function pickSmartHealthyBackup(
  providers: ProviderInfo[],
  depth: BlueprintDepth,
  cooldowns: PoolCooldown[],
  fallbackPolicy: FallbackPolicy
): { provider: ProviderId; model: string } {
  const exhausted = new Set(cooldowns.map((c) => c.pool));
  const isHealthy = (p: ProviderId, m: string) =>
    !exhausted.has(getQuotaPoolKey(p, m));

  // 1. Respect user's explicitly configured custom backup agent first (if healthy)
  if (
    fallbackPolicy.mode === 'custom' &&
    fallbackPolicy.customProvider &&
    fallbackPolicy.customModel
  ) {
    const info = providers.find(
      (p) => p.id === fallbackPolicy.customProvider && p.installed
    );
    if (
      info &&
      isHealthy(fallbackPolicy.customProvider, fallbackPolicy.customModel)
    ) {
      return {
        provider: fallbackPolicy.customProvider,
        model: fallbackPolicy.customModel,
      };
    }
  }

  // 2. Quality-matched healthy ranking (NEVER defaults core MDs to weak/low-tier models!)
  const ordered: { provider: ProviderId; models: string[] }[] =
    depth === 'deep'
      ? [
          {
            provider: 'antigravity',
            models: ['gemini-4-neon-high', 'gemini-4-argon-high', 'claude-opus-5-5-high'],
          },
          { provider: 'codex', models: ['gpt-6-luna', 'gpt-5.6-terra'] },
          { provider: 'claude', models: ['opus', 'sonnet'] },
        ]
      : [
          {
            provider: 'antigravity',
            models: [
              'gemini-4-neon-medium',
              'gemini-4-argon-medium',
              'gemini-4-neon-low',
              'claude-sonnet-5-5-medium',
            ],
          },
          { provider: 'codex', models: ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.6-terra'] },
          { provider: 'claude', models: ['sonnet', 'opus'] },
          { provider: 'antigravity', models: ['gpt-oss-120b-medium', 'gemini-3.8-flash-medium'] },
        ];

  for (const group of ordered) {
    const info = providers.find((p) => p.id === group.provider && p.installed);
    if (!info) continue;
    for (const m of group.models) {
      if (info.models.some((x) => x.id === m) && isHealthy(group.provider, m)) {
        return { provider: group.provider, model: m };
      }
    }
  }

  return pickWriterForDepth(
    providers,
    depth === 'concise' ? 'standard' : depth,
    cooldowns
  );
}
