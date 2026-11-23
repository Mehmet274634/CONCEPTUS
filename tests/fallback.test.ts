import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearAllCooldowns,
  getFallbackPolicy,
  getModelCaliber,
  getQuotaPoolKey,
  getRequiredCaliber,
  isPoolExhausted,
  isQuotaOrLimitError,
  listActiveCooldowns,
  markPoolExhausted,
  setFallbackPolicy,
} from '../server/fallback.ts';

describe('Quota Circuit Breaker & Quality-Matched Fallback Engine', () => {
  const originalDir = process.env.CONCEPTUS_DATA_DIR;
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conceptus-fallback-'));
    process.env.CONCEPTUS_DATA_DIR = dir;
  });
  afterAll(() => {
    if (originalDir === undefined) delete process.env.CONCEPTUS_DATA_DIR;
    else process.env.CONCEPTUS_DATA_DIR = originalDir;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('separates quota pools cleanly across providers and Antigravity sub-pools', () => {
    expect(getQuotaPoolKey('antigravity', 'claude-sonnet-5-5-low')).toBe('antigravity:claude');
    expect(getQuotaPoolKey('antigravity', 'claude-opus-5-5-high')).toBe('antigravity:claude');
    expect(getQuotaPoolKey('antigravity', 'gemini-4-neon-high')).toBe('antigravity:gemini');
    expect(getQuotaPoolKey('antigravity', 'gpt-oss-120b-medium')).toBe('antigravity:oss');
    expect(getQuotaPoolKey('codex', 'gpt-6-luna')).toBe('codex:all');
    expect(getQuotaPoolKey('claude', 'opus')).toBe('claude:all');
  });

  it('recognizes real CLI quota/rate-limit messages accurately', () => {
    expect(isQuotaOrLimitError('Individual quota reached. Resets in 91h55m39s.')).toBe(true);
    expect(isQuotaOrLimitError('429 Too Many Requests: RESOURCE_EXHAUSTED')).toBe(true);
    expect(isQuotaOrLimitError('You have hit your weekly limit')).toBe(true);
    expect(isQuotaOrLimitError('IneligibleTierError: please migrate')).toBe(true);
    expect(isQuotaOrLimitError('SyntaxError: unexpected token')).toBe(false);
  });

  it('classifies model caliber accurately and prevents downgrading high-stakes jobs', () => {
    expect(getModelCaliber('antigravity', 'gemini-3.8-flash-low')).toBe('fast');
    expect(getModelCaliber('antigravity', 'gemini-4-neon-medium')).toBe('balanced');
    expect(getModelCaliber('antigravity', 'gemini-4-neon-high')).toBe('flagship');
    expect(getModelCaliber('codex', 'gpt-6-luna')).toBe('flagship');
    expect(getModelCaliber('claude', 'haiku')).toBe('fast');

    // Core blueprints & debates NEVER downgrade to fast
    expect(
      getRequiredCaliber('antigravity', 'claude-sonnet-5-5-low', 'concise', 'blueprint_core')
    ).toBe('balanced');
    expect(
      getRequiredCaliber('antigravity', 'claude-sonnet-5-5-low', 'concise', 'debate')
    ).toBe('balanced');

    // Master synthesis & flagship models stay flagship
    expect(
      getRequiredCaliber('antigravity', 'claude-opus-5-5-high', 'deep', 'synthesis')
    ).toBe('flagship');
    expect(
      getRequiredCaliber('codex', 'gpt-6-luna', 'concise', 'blueprint_standard')
    ).toBe('flagship');
  });

  it('tracks pool cooldowns independently without affecting healthy pools', () => {
    clearAllCooldowns();
    markPoolExhausted('antigravity', 'claude-sonnet-5-5-low', 'Individual quota reached');

    expect(isPoolExhausted('antigravity', 'claude-opus-5-5-high')).not.toBeNull();
    expect(isPoolExhausted('antigravity', 'gemini-4-neon-medium')).toBeNull();
    expect(isPoolExhausted('codex', 'gpt-6-luna')).toBeNull();
    expect(listActiveCooldowns().map((c) => c.pool)).toContain('antigravity:claude');

    clearAllCooldowns();
    expect(listActiveCooldowns()).toHaveLength(0);
  });

  it('updates and persists custom, ask, and quality_auto fallback policies', () => {
    const custom = setFallbackPolicy({
      mode: 'custom',
      customProvider: 'codex',
      customModel: 'gpt-6-luna',
      preventDowngrade: true,
    });
    expect(custom.mode).toBe('custom');
    expect(custom.customProvider).toBe('codex');
    expect(custom.customModel).toBe('gpt-6-luna');

    const ask = setFallbackPolicy({ mode: 'ask' });
    expect(ask.mode).toBe('ask');

    const auto = setFallbackPolicy({ mode: 'quality_auto', preventDowngrade: true });
    expect(auto).toMatchObject({ mode: 'quality_auto', preventDowngrade: true });
    expect(getFallbackPolicy().mode).toBe('quality_auto');
  });
});
