import { describe, expect, it } from 'vitest';
import {
  buildBlueprintFilePrompt,
  buildIdeaClarifierPrompt,
  getDefaultBlueprintPlan,
} from '../server/prompts.ts';
import type { DebateSession } from '../server/types.ts';

function makeMockSession(): DebateSession {
  return {
    id: 'cpt_test_prompts',
    title: 'TestApp',
    idea: 'Evdeki malzemelerle tarif öneren basit mobil uygulama.',
    domain: 'app_product',
    constraints: 'Sıfır maliyet, offline çalışmalı.',
    contextText: '',
    seats: [],
    rounds: [],
    synthesis: {
      seatId: 'judge',
      provider: 'antigravity',
      model: 'gemini-4-neon-high',
      status: 'done',
      content: '# Nihai Karar\nOffline-first PWA tarifi.',
      decisionGates: [
        {
          id: 'gate_1',
          question: 'Veri depolama yöntemi ne olsun?',
          recommendation: 'A',
          selectedOptionId: 'A',
          options: [
            { id: 'A', label: 'Yerel IndexedDB', tradeoff: 'Sıfır sunucu maliyeti' },
            { id: 'B', label: 'Bulut DB', tradeoff: 'Hesap gerektirir' },
          ],
        },
      ],
      startedAt: Date.now(),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('CONCEPTUS Prompt & Blueprint Standards', () => {
  it('returns the 5-file numbered app-build MD standard for app_product', () => {
    const plan = getDefaultBlueprintPlan('app_product');
    expect(plan).toHaveLength(5);
    expect(plan.map((f) => f.filename)).toEqual([
      '01_PRODUCT_VISION.md',
      '02_UX_SCREENS_AND_DESIGN.md',
      '03_ARCHITECTURE_AND_DATA.md',
      '04_BUILD_ROADMAP.md',
      '05_AGENTS_START_HERE.md',
    ]);
  });

  it('enforces no-tool guard, locked user decisions, Mermaid diagrams, and revision notes', () => {
    const session = makeMockSession();
    const specs = getDefaultBlueprintPlan('app_product');

    const uxPrompt = buildBlueprintFilePrompt(session, specs[1], specs, 'concise');
    expect(uxPrompt).toContain('HİÇBİR ARAÇ/TOOL ÇAĞIRMA');
    expect(uxPrompt).toContain('Yerel IndexedDB');
    expect(uxPrompt).toContain('flowchart LR');

    const archPrompt = buildBlueprintFilePrompt(session, specs[2], specs, 'standard', {
      note: 'SQLite yerine IndexedDB kullan ve şifrelemeyi ekle.',
      previousContent: '# Eski Mimari\nSQLite kullanır.',
    });
    expect(archPrompt).toContain('KULLANICI REVİZYON TALİMATI');
    expect(archPrompt).toContain('SQLite yerine IndexedDB kullan');
    expect(archPrompt).toContain('erDiagram');
  });

  it('builds a strict JSON-only prompt for Idea Clarifier in both TR and EN', () => {
    const trPrompt = buildIdeaClarifierPrompt('Basit bir bütçe takipçisi yapmak istiyorum.', 'app_product', 'tr');
    expect(trPrompt).toContain('HİÇBİR araç/tool ÇAĞIRMA');
    expect(trPrompt).toContain('Türkçe');

    const enPrompt = buildIdeaClarifierPrompt('I want a simple budget tracker app.', 'app_product', 'en');
    expect(enPrompt).toContain('ENGLISH');
  });

  it('injects strict English output language rule when session.language is en', () => {
    const enSession = { ...makeMockSession(), language: 'en' as const };
    const specs = getDefaultBlueprintPlan('app_product');
    const prompt = buildBlueprintFilePrompt(enSession, specs[0], specs, 'concise');
    expect(prompt).toContain('OUTPUT LANGUAGE RULE');
    expect(prompt).toContain('ENGLISH');
  });
});
