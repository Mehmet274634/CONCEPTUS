import { describe, expect, it } from 'vitest';
import type { BlueprintFileSpec, FallbackPolicy, PoolCooldown, ProviderInfo } from '../src/types.ts';
import {
  autoAssignSpecialistModels,
  pickSmartHealthyBackup,
  pickWriterForDepth,
} from '../src/utils/blueprintRouting.ts';

const MOCK_PROVIDERS: ProviderInfo[] = [
  {
    id: 'antigravity',
    name: 'Antigravity',
    command: 'agy',
    installed: true,
    supportsEffort: true,
    models: [
      { id: 'auto', label: 'auto' },
      { id: 'gemini-3.8-flash-low', label: 'gemini-3.8-flash-low' },
      { id: 'gemini-4-neon-low', label: 'gemini-4-neon-low' },
      { id: 'gemini-4-neon-medium', label: 'gemini-4-neon-medium' },
      { id: 'gemini-4-neon-high', label: 'gemini-4-neon-high' },
      { id: 'claude-sonnet-5-5-low', label: 'claude-sonnet-5-5-low' },
      { id: 'claude-sonnet-5-5-medium', label: 'claude-sonnet-5-5-medium' },
      { id: 'claude-opus-5-5-high', label: 'claude-opus-5-5-high' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    installed: true,
    supportsEffort: true,
    models: [
      { id: 'default', label: 'default' },
      { id: 'gpt-6-luna', label: 'gpt-6-luna' },
      { id: 'gpt-5.6-luna', label: 'gpt-5.6-luna' },
    ],
  },
];

const MOCK_SPECS: BlueprintFileSpec[] = [
  { id: '1', filename: '01_PRODUCT_VISION.md', title: 'Vision', purpose: 'P', selected: true },
  { id: '2', filename: '03_ARCHITECTURE_AND_DATA.md', title: 'Arch', purpose: 'A', selected: true },
  { id: '3', filename: '04_BUILD_ROADMAP.md', title: 'Road', purpose: 'R', selected: true },
];

describe('Tiered Specialist Model Routing & Healthy Backup Selection', () => {
  it('upgrades writer & specialist models cleanly from concise -> standard -> deep', () => {
    const fastWriter = pickWriterForDepth(MOCK_PROVIDERS, 'concise');
    const stdWriter = pickWriterForDepth(MOCK_PROVIDERS, 'standard');
    const deepWriter = pickWriterForDepth(MOCK_PROVIDERS, 'deep');

    expect(fastWriter.model).toBe('gemini-3.8-flash-low');
    expect(stdWriter.model).toBe('gemini-4-neon-medium');
    expect(deepWriter.model).toBe('gemini-4-neon-high');

    const deepAssigned = autoAssignSpecialistModels(MOCK_SPECS, MOCK_PROVIDERS, 'deep', deepWriter);
    expect(deepAssigned[0].assignedModel).toBe('claude-opus-5-5-high');
    expect(deepAssigned[1].assignedModel).toBe('gemini-4-neon-high');
    expect(deepAssigned[2].assignedProvider).toBe('codex');
    expect(deepAssigned[2].assignedModel).toBe('gpt-6-luna');
  });

  it('skips exhausted antigravity:claude pool during specialist assignment & backup picking', () => {
    const cooldowns: PoolCooldown[] = [
      {
        pool: 'antigravity:claude',
        reason: 'Individual quota reached',
        detectedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    ];

    const assigned = autoAssignSpecialistModels(
      MOCK_SPECS,
      MOCK_PROVIDERS,
      'standard',
      { provider: 'antigravity', model: 'gemini-4-neon-medium' },
      cooldowns
    );
    // Must NOT assign claude-* when antigravity:claude is exhausted
    expect(assigned[0].assignedModel).not.toContain('claude');
    expect(assigned[0].assignedModel).toBe('gemini-4-neon-medium');

    const autoPolicy: FallbackPolicy = { mode: 'quality_auto', preventDowngrade: true };
    const smartPick = pickSmartHealthyBackup(MOCK_PROVIDERS, 'concise', cooldowns, autoPolicy);
    expect(smartPick.model).toBe('gemini-4-neon-medium');

    const customPolicy: FallbackPolicy = {
      mode: 'custom',
      customProvider: 'codex',
      customModel: 'gpt-6-luna',
      preventDowngrade: true,
    };
    const customPick = pickSmartHealthyBackup(MOCK_PROVIDERS, 'concise', cooldowns, customPolicy);
    expect(customPick).toEqual({ provider: 'codex', model: 'gpt-6-luna' });
  });
});
