import { describe, expect, it } from 'vitest';
import { lintBlueprintPack } from '../server/blueprintLinter.ts';
import type { DebateSession, ProjectContract } from '../server/types.ts';

function fillerWords(n: number): string {
  return Array.from({ length: n }, (_, i) => `mimariKarar${i}`).join(' ');
}

function makeCleanSession(contract?: ProjectContract): DebateSession {
  return {
    id: 'cpt_lint_test',
    title: 'OdakStüdyo',
    idea: 'Offline-first odak ve görev uygulaması.',
    domain: 'app_product',
    constraints: 'Sıfır sunucu maliyeti.',
    contextText: '',
    seats: [],
    rounds: [],
    blueprint: {
      provider: 'antigravity',
      model: 'gemini-4-neon-high',
      depth: 'standard',
      startedAt: Date.now(),
      contract,
      files: [
        {
          id: 'f1',
          filename: '01_PRODUCT_VISION.md',
          title: 'Ürün Vizyonu',
          purpose: 'Kapsam',
          status: 'done',
          provider: 'antigravity',
          model: 'gemini-4-neon-high',
          content: `# 01 Ürün Vizyonu\n\nTaskEntity ve FocusSession varlıkları nettir. ${fillerWords(200)}\n\`\`\`ts\n// TODO inside fenced code block must NOT be flagged\nconst ok = true;\n\`\`\``,
        },
        {
          id: 'f2',
          filename: '02_UX_SCREENS_AND_DESIGN.md',
          title: 'UX ve Ekranlar',
          purpose: 'Ekran akışı',
          status: 'done',
          provider: 'antigravity',
          model: 'gemini-4-neon-high',
          content: `# 02 UX & Ekran Akışı\n\nGiriş alanlarında input placeholder rengi #6b7280 kullanılır.\n\n\`\`\`mermaid\nflowchart LR\n  A["Ana Ekran"] --> B["Odak Oturumu"]\n\`\`\`\n\n${fillerWords(200)}`,
        },
        {
          id: 'f3',
          filename: '03_ARCHITECTURE_AND_DATA.md',
          title: 'Mimari ve Veri',
          purpose: 'Veri modeli',
          status: 'done',
          provider: 'codex',
          model: 'gpt-6-luna',
          content: `# 03 Mimari & Veri\n\nTaskEntity ve FocusSession tabloları yerel IndexedDB içinde saklanır.\n\n\`\`\`mermaid\nerDiagram\n  TaskEntity ||--o{ FocusSession : tracks\n\`\`\`\n\n${fillerWords(200)}`,
        },
        {
          id: 'f4',
          filename: '04_BUILD_ROADMAP.md',
          title: 'Yol Haritası',
          purpose: 'Faz planı',
          status: 'done',
          provider: 'codex',
          model: 'gpt-6-luna',
          content: `# 04 Yol Haritası\n\n## Faz 1 — Proje İskeleti ve Kurulum\n\`npm run typecheck\`\n\n## Faz 2 — Yerel Veri Temeli ve FTS5\n\`npm run db:verify\`\n\n${fillerWords(200)}`,
        },
        {
          id: 'f5',
          filename: '05_AGENTS_START_HERE.md',
          title: 'Başlangıç',
          purpose: 'Hard Invariants',
          status: 'done',
          provider: 'claude',
          model: 'claude-opus-4-6',
          content: `# 05 Ajan Başlangıç\n\n0. \`PROJECT_CONTRACT.json\` dosyasını oku.\n\n## Değiştirilemez Kurallar (Hard Invariants)\n- Offline çalışmalı, harici telemetry yasak.\n\n### Faz 2 — Yerel Veri Temeli ve FTS5\n${fillerWords(200)}`,
        },
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('CONCEPTUS v5.0 — 0-Token Deterministic Local Blueprint Linter', () => {
  it('scores a clean contract-aligned blueprint pack 100/100 and ignores TODO inside fenced code blocks', () => {
    const contract: ProjectContract = {
      projectName: 'OdakStüdyo',
      stack: ['React 19', 'TypeScript', 'IndexedDB'],
      entities: ['TaskEntity', 'FocusSession'],
      routes: ['/focus', '/tasks'],
      folderTree: ['src/features/focus'],
      hardInvariants: ['Offline çalışmalı', 'Harici telemetry yasak'],
      nonGoals: ['Sosyal akış yok'],
      rawJson: '{}',
      generatedAt: Date.now(),
    };

    const report = lintBlueprintPack(makeCleanSession(contract));
    expect(report.score).toBe(100);
    expect(report.issues).toHaveLength(0);
    expect(report.passedChecks).toBe(report.totalChecks);
  });

  it('catches TBD/TODO prose leakage, broken Mermaid quotes, missing H1, stub files, and contract entity drift', () => {
    const contract: ProjectContract = {
      projectName: 'OdakStüdyo',
      stack: ['React'],
      entities: ['InvoiceLedger', 'TenantVault', 'AuditTrail'],
      routes: ['/billing'],
      folderTree: ['src/'],
      hardInvariants: ['Sıfır yetkisiz erişim'],
      nonGoals: [],
      rawJson: '{}',
      generatedAt: Date.now(),
    };

    const session = makeCleanSession(contract);
    // Corrupt files intentionally
    session.blueprint!.files[0].content = 'Başlıksız çok kısa TBD karar verilecek taslak.';
    session.blueprint!.files[1].content = `# 02 UX\n\n\`\`\`mermaid\nflowchart LR\n  A["Kapatılmamış tırnak] --> B\n\`\`\`\n\n${fillerWords(200)}`;
    session.blueprint!.files[4].content = `# 05 Başlangıç\n\nSadece genel giriş metni. ${fillerWords(200)}`;

    const report = lintBlueprintPack(session);
    expect(report.score).toBeLessThan(70);

    const descs = report.issues.map((i) => i.description).join('\n');
    expect(descs).toContain('H1');
    expect(descs).toContain('çok kısa');
    expect(descs).toContain('TBD');
    expect(descs).toContain('Mermaid');
    expect(descs).toContain('InvoiceLedger');
    expect(descs).toContain('Hard Invariants');
    expect(descs).toContain('PROJECT_CONTRACT.json');
  });

  it('v5.1: catches cross-file Phase 2 drift between 04_BUILD_ROADMAP.md and 05_AGENTS_START_HERE.md', () => {
    const session = makeCleanSession();
    // 04 has "Faz 2 — Yerel Veri Temeli ve FTS5", intentionally mismatch 05 to "Faz 2 — Native Ses Kaydı"
    session.blueprint!.files[4].content = `# 05 Ajan Başlangıç\n\n0. \`PROJECT_CONTRACT.json\`\n## Hard Invariants\n- Offline\n### Faz 2 — Native Arka Plan Ses Kaydı ve İçe Aktarma\n${fillerWords(200)}`;

    const report = lintBlueprintPack(session);
    const phaseIssue = report.issues.find((i) => i.description.includes('Faz 2'));
    expect(phaseIssue).toBeDefined();
    expect(phaseIssue?.severity).toBe('high');
    expect(phaseIssue?.conflictWith).toBe('04_BUILD_ROADMAP.md');
  });
});
