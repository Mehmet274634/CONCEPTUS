import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintBlueprintPack } from '../server/blueprintLinter.ts';
import { openFolderInIde } from '../server/ideLauncher.ts';
import { getDefaultBlueprintPlan } from '../server/prompts.ts';
import type { DebateRound, DebateSession, GeneratedMdFile } from '../src/types.ts';
import {
  collectFileIssueCounts,
  extractPackMermaidDiagrams,
  extractPhasePrompts,
  extractRoundHighlights,
} from '../src/utils/blueprintOverview.ts';

function makeBaseSession(overrides?: Partial<DebateSession>): DebateSession {
  return {
    id: 'cpt_test_overview',
    title: 'NeylePiser',
    idea: 'Dolaptaki malzemelerle tarif öneren uygulama',
    domain: 'app_product',
    language: 'tr',
    constraints: '',
    contextText: '',
    seats: [],
    rounds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('v5.2.0 Visual Overview, Phase Prompts & Highlights', () => {
  it('extracts Phase 1 & Phase 2 fenced prompts and synthesizes Phase 3 from contract', () => {
    const agentsMd = [
      '# 05_AGENTS_START_HERE',
      '## 6. Faz 1 Başlangıç Promptu',
      '```text',
      'Önce PROJECT_CONTRACT.json ve 01..05 dosyalarını oku. YALNIZCA Faz 1 iskeletini ve kalite kapılarını inşa et.',
      '```',
      '## 7. Faz 2 Devam Promptu',
      '```text',
      'Faz 1 tamamlandı. Şimdi YALNIZCA Faz 2 veri katmanı ve çekirdek motorunu eksiksiz kur ve testleri geçir.',
      '```',
    ].join('\n');

    const session = makeBaseSession({
      blueprint: {
        provider: 'antigravity',
        model: 'gemini-4-neon-high',
        depth: 'standard',
        startedAt: Date.now(),
        contract: {
          projectName: 'NeylePiser',
          stack: ['Next.js 15', 'TypeScript', 'Dexie'],
          entities: ['Recipe', 'PantryItem'],
          routes: ['/ (Kiler)', '/recipes (Tarifler)'],
          folderTree: ['src/app/', 'src/lib/'],
          phases: [
            'Faz 1: Proje İskeleti ve Kalite Kapıları',
            'Faz 2: Veri Katmanı & Eşleştirme Motoru',
            'Faz 3: Ana Ekran & Alışveriş Listesi',
          ],
          hardInvariants: ['Aylık 0 USD maliyet', 'Local-First IndexedDB'],
          nonGoals: ['Bulut senkronizasyonu'],
        },
        files: [
          {
            id: 'f1',
            filename: '01_PRODUCT_VISION.md',
            title: 'Vizyon',
            purpose: 'Vizyon',
            status: 'done',
            content: '# Ürün Vizyonu\nDetaylı içerik',
            provider: 'antigravity',
            model: 'gemini-4-neon-high',
          },
          {
            id: 'f5',
            filename: '05_AGENTS_START_HERE.md',
            title: 'Ajan Talimatı',
            purpose: 'Talimat',
            status: 'done',
            content: agentsMd,
            provider: 'antigravity',
            model: 'gemini-4-neon-high',
          },
        ],
      },
    });

    const prompts = extractPhasePrompts(session);
    expect(prompts).toHaveLength(3);
    expect(prompts[0].label).toBe('Faz 1');
    expect(prompts[0].source).toBe('extracted');
    expect(prompts[0].prompt).toContain('YALNIZCA Faz 1');
    expect(prompts[1].label).toBe('Faz 2');
    expect(prompts[1].source).toBe('extracted');
    expect(prompts[2].label).toBe('Faz 3');
    expect(prompts[2].source).toBe('synthesized');
    expect(prompts[2].prompt).toContain('Faz 3');
  });

  it('extracts up to 2 prioritized Mermaid diagrams (UX & Arch)', () => {
    const files: GeneratedMdFile[] = [
      {
        id: 'f1',
        filename: '01_PRODUCT_VISION.md',
        title: 'Vision',
        purpose: 'Vision',
        status: 'done',
        content: '# Vision\n```mermaid\nflowchart TD\nA --> B\n```',
        provider: 'antigravity',
        model: 'm',
      },
      {
        id: 'f3',
        filename: '03_ARCHITECTURE_AND_DATA.md',
        title: 'Arch',
        purpose: 'Arch',
        status: 'done',
        content: '# Arch\n```mermaid\nerDiagram\nRECIPE ||--o{ ITEM : uses\n```',
        provider: 'antigravity',
        model: 'm',
      },
      {
        id: 'f2',
        filename: '02_UX_SCREENS_AND_DESIGN.md',
        title: 'UX',
        purpose: 'UX',
        status: 'done',
        content: '# UX\n```mermaid\nflowchart LR\nHome --> Detail\n```',
        provider: 'antigravity',
        model: 'm',
      },
    ];

    const diagrams = extractPackMermaidDiagrams(files);
    expect(diagrams).toHaveLength(2);
    expect(diagrams[0].filename).toBe('02_UX_SCREENS_AND_DESIGN.md');
    expect(diagrams[1].filename).toBe('03_ARCHITECTURE_AND_DATA.md');
  });

  it('extracts 0-token round highlights including optional X/10 score', () => {
    const round: DebateRound = {
      roundNumber: 1,
      kind: 'blind_analysis',
      title: 'Bağımsız Fikir',
      startedAt: Date.now(),
      responses: [
        {
          seatId: 's1',
          seatLabel: 'Gemini · Mimar',
          anonymousId: 'Ajan A',
          provider: 'antigravity',
          model: 'gemini-4-neon-high',
          role: 'chief_architect',
          status: 'done',
          content:
            '### 1. Özet\n**Local-first IndexedDB mimarisi** ile aylık 0 USD maliyetli anlık arama öneriyorum.\nGenel Puan: 9.2/10',
        },
        {
          seatId: 's2',
          seatLabel: 'Claude · Risk',
          anonymousId: 'Ajan B',
          provider: 'antigravity',
          model: 'claude-opus-5-5-medium',
          role: 'risk_auditor',
          status: 'done',
          content:
            '### Risk\n- Türkçe malzeme eşanlamlı eşleştirme normalizasyonu olmadan sonuçlar boş döner (7,5/10).',
        },
      ],
    };

    const highlights = extractRoundHighlights(round);
    expect(highlights).toHaveLength(2);
    expect(highlights[0].score).toBe('9.2/10');
    expect(highlights[0].headline).toContain('Local-first IndexedDB mimarisi');
    expect(highlights[1].score).toBe('7.5/10');
    expect(highlights[1].headline).toContain('Türkçe malzeme eşanlamlı');
  });

  it('counts open Lint + QA issues per file', () => {
    const session = makeBaseSession({
      blueprint: {
        provider: 'antigravity',
        model: 'm',
        depth: 'standard',
        startedAt: Date.now(),
        files: [],
        lint: {
          score: 90,
          passedChecks: 9,
          totalChecks: 10,
          checkedAt: Date.now(),
          issues: [
            {
              id: 'l1',
              severity: 'medium',
              file: '02_UX_SCREENS_AND_DESIGN.md',
              description: 'Mermaid eksik',
              fixInstruction: 'Ekle',
            },
          ],
        },
        audit: {
          score: 88,
          summary: 'İyi',
          provider: 'antigravity',
          model: 'm',
          durationMs: 1200,
          checkedAt: Date.now(),
          issues: [
            {
              id: 'a1',
              severity: 'high',
              file: '02_UX_SCREENS_AND_DESIGN.md',
              description: 'Çelişki',
              fixInstruction: 'Düzelt',
            },
          ],
        },
      },
    });

    const counts = collectFileIssueCounts(session);
    expect(counts['02_UX_SCREENS_AND_DESIGN.md']).toEqual({
      high: 1,
      medium: 1,
      low: 0,
      total: 2,
    });
  });

  it('returns 3-file Existing Codebase Evolution pack when projectMode is existing_feature', () => {
    const plan = getDefaultBlueprintPlan('app_product', undefined, 'existing_feature');
    expect(plan).toHaveLength(3);
    expect(plan.map((p) => p.filename)).toEqual([
      '01_CHANGE_PROPOSAL.md',
      '02_MIGRATION_AND_ARCH_DIFF.md',
      '03_AGENTS_EXECUTION_GUIDE.md',
    ]);
  });

  it('ignores negative TBD prohibition rules in blueprintLinter while still catching real TBDs', () => {
    const filler = Array.from({ length: 200 }, (_, i) => `kural${i}`).join(' ');
    const cleanSession = makeBaseSession({
      blueprint: {
        provider: 'antigravity',
        model: 'm',
        depth: 'standard',
        startedAt: Date.now(),
        files: [
          {
            id: 'f1',
            filename: '05_AGENTS_START_HERE.md',
            title: 'Agents',
            purpose: 'Agents',
            status: 'done',
            provider: 'antigravity',
            model: 'm',
            content: `# Başlangıç Talimatı\nKod veya doküman içine asla "TBD", "TODO" veya "karar verilecek" eklenemez.\n${filler}`,
          },
        ],
      },
    });

    const cleanLint = lintBlueprintPack(cleanSession as any);
    expect(cleanLint.issues.some((i) => i.description.includes('belirsiz ifadeler'))).toBe(false);

    const leakySession = makeBaseSession({
      blueprint: {
        provider: 'antigravity',
        model: 'm',
        depth: 'standard',
        startedAt: Date.now(),
        files: [
          {
            id: 'f1',
            filename: '01_PRODUCT_VISION.md',
            title: 'Vision',
            purpose: 'Vision',
            status: 'done',
            provider: 'antigravity',
            model: 'm',
            content: `# Ürün Vizyonu\nFiyatlandırma modeli: TBD\n${filler}`,
          },
        ],
      },
    });

    const leakyLint = lintBlueprintPack(leakySession as any);
    expect(leakyLint.issues.some((i) => i.description.includes('TBD'))).toBe(true);
  });

  it('rejects invalid paths and disallowed IDE ids in openFolderInIde', async () => {
    const badPathRes = await openFolderInIde('C:\\definitely-non-existent-dir-999999', 'vscode');
    expect(badPathRes.ok).toBe(false);

    const tmpFile = path.join(os.tmpdir(), `conceptus-test-file-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'x', 'utf8');
    try {
      const fileRes = await openFolderInIde(tmpFile, 'vscode');
      expect(fileRes.ok).toBe(false);
    } finally {
      fs.rmSync(tmpFile, { force: true });
    }

    const badIdeRes = await openFolderInIde(os.tmpdir(), 'malicious_cmd' as any);
    expect(badIdeRes.ok).toBe(false);
  });
});
