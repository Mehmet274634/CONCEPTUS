import { describe, expect, it } from 'vitest';
import {
  buildBlueprintFilePrompt,
  buildCrossDebatePrompt,
  buildIdeaClarifierPrompt,
  buildProjectContractPrompt,
  buildRedTeamPrompt,
  buildTargetedChallengePrompt,
  buildWave1Digest,
  getDefaultBlueprintPlan,
} from '../server/prompts.ts';
import type { DebateRound, DebateSession, ProjectContract, SeatConfig } from '../server/types.ts';

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

  it('v5.0: expands app_product plan to 6 files (including 04B_API_AND_SECURITY_SPEC.md) for XL complexity', () => {
    const xlPlan = getDefaultBlueprintPlan('app_product', 'XL');
    expect(xlPlan).toHaveLength(6);
    expect(xlPlan.some((f) => f.filename === '04B_API_AND_SECURITY_SPEC.md')).toBe(true);
  });

  it('v5.0: locks Wave 0 PROJECT_CONTRACT, Edge-Case Matrix, Verification Gates, and Phase Starter Prompts', () => {
    const session = makeMockSession();
    const contractPrompt = buildProjectContractPrompt(session);
    expect(contractPrompt).toContain('PROJECT_CONTRACT.json');
    expect(contractPrompt).toContain('hardInvariants');
    expect(contractPrompt).toContain('sharedComponents');
    expect(contractPrompt).toContain('sharedConstants');
    expect(contractPrompt).toContain('phases');

    const contract: ProjectContract = {
      projectName: 'TestApp',
      stack: ['React 19', 'IndexedDB'],
      entities: ['PantryItem', 'RecipeDraft'],
      routes: ['/pantry', '/recipes'],
      folderTree: ['src/features/pantry'],
      sharedComponents: ['GlassCard', 'RecipePill'],
      sharedConstants: ['MIN_STORAGE_MB=200'],
      phases: ['Faz 1: Proje İskeleti', 'Faz 2: IndexedDB Veri Katmanı'],
      hardInvariants: ['Sıfır sunucu bağımlılığı'],
      nonGoals: ['Sosyal paylaşım yok'],
      rawJson: '{}',
      generatedAt: Date.now(),
    };
    const specs = getDefaultBlueprintPlan('app_product');

    const uxPrompt = buildBlueprintFilePrompt(session, specs[1], specs, 'standard', undefined, contract);
    expect(uxPrompt).toContain('PantryItem');
    expect(uxPrompt).toContain('GlassCard');
    expect(uxPrompt).toContain('Loading');
    expect(uxPrompt).toContain('Empty');

    const roadmapPrompt = buildBlueprintFilePrompt(session, specs[3], specs, 'standard', undefined, contract);
    expect(roadmapPrompt).toContain('YÜRÜTÜLEBİLİR DOĞRULAMA KAPILARI');
    expect(roadmapPrompt).toContain('Faz 2: IndexedDB Veri Katmanı');

    const wave1Digest = buildWave1Digest([
      {
        filename: '04_BUILD_ROADMAP.md',
        status: 'done',
        content: '# 04\n## Faz 1 — Proje İskeleti\n## Faz 2 — IndexedDB Veri Katmanı\n`npm run typecheck` `npm run db:verify`',
      },
    ]);
    expect(wave1Digest).toContain('Faz 2 — IndexedDB Veri Katmanı');
    expect(wave1Digest).toContain('npm run db:verify');

    const agentsPrompt = buildBlueprintFilePrompt(session, specs[4], specs, 'standard', undefined, contract, wave1Digest);
    expect(agentsPrompt).toContain('Faz 1 Başlangıç Promptu');
    expect(agentsPrompt).toContain('Sıfır sunucu bağımlılığı');
    expect(agentsPrompt).toContain('0. PROJECT_CONTRACT.json');
    expect(agentsPrompt).toContain('Faz 2 — IndexedDB Veri Katmanı');
  });

  it('v5.0: uses Delta-Only conflict protocol in Round 2+ and supports Red-Team & Targeted @Seat interventions', () => {
    const session = makeMockSession();
    const seat: SeatConfig = {
      id: 'seat_1',
      label: 'Baş Mimar',
      provider: 'claude',
      model: 'claude-opus-4-6',
      role: 'chief_architect',
      effort: 'high',
      economyMode: false,
      enabled: true,
    };
    const round1: DebateRound = {
      roundNumber: 1,
      title: 'Bağımsız Fikir',
      kind: 'blind_analysis',
      startedAt: Date.now(),
      responses: [
        {
          seatId: 'seat_1',
          seatLabel: 'Baş Mimar',
          anonymousId: 'Ajan A',
          provider: 'claude',
          model: 'claude-opus-4-6',
          role: 'chief_architect',
          status: 'done',
          content: 'Yerel IndexedDB öneriyorum.',
          startedAt: Date.now(),
        },
      ],
    };

    const deltaPrompt = buildCrossDebatePrompt(session, seat, round1, 2);
    expect(deltaPrompt).toContain('ÇATIŞMA ODAKLI DELTA TARTIŞMASI');
    expect(deltaPrompt).toContain('DELTA TARTIŞMA ÜSLUBU');

    const redTeamPrompt = buildRedTeamPrompt(session, seat);
    expect(redTeamPrompt).toContain('ŞEYTANIN AVUKATI');
    expect(redTeamPrompt).toContain('En Ölümcül 5 Başarısızlık Senaryosu');

    const challengePrompt = buildTargetedChallengePrompt(
      session,
      seat,
      'Offline-first yerine SQLite WASM kullansak nasıl olur?'
    );
    expect(challengePrompt).toContain('KULLANICININ DOĞRUDAN MÜDAHALESİ');
    expect(challengePrompt).toContain('SQLite WASM');
  });
});
