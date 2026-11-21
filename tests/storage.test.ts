import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildBlueprintZipBuffer,
  deleteSession,
  saveBlueprintToFolder,
  slugifyProjectName,
} from '../server/storage.ts';
import type { DebateSession } from '../server/types.ts';

describe('Storage, ZIP Export & AGENTS.md Bridge Generation', () => {
  const testSessionId = `cpt_unit_${Date.now().toString(36)}`;
  const tempExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conceptus-export-test-'));

  afterAll(() => {
    deleteSession(testSessionId);
    fs.rmSync(tempExportDir, { recursive: true, force: true });
  });

  it('slugifies Turkish project names cleanly into ASCII paths', () => {
    expect(slugifyProjectName('OdakKalkanı & Şef Ürünü!')).toBe('odakkalkani-sef-urunu');
    expect(slugifyProjectName('   ')).toBe('conceptus-proje');
  });

  it('packages numbered MDs, MASTER_DECISION.md, README.md, and AGENTS.md in ZIP & folder exports', async () => {
    const session: DebateSession = {
      id: testSessionId,
      title: 'Şef Tarifi',
      idea: 'Dolap tarif uygulaması',
      domain: 'app_product',
      constraints: '',
      contextText: '',
      seats: [],
      rounds: [],
      synthesis: {
        seatId: 'judge',
        provider: 'antigravity',
        model: 'gemini-4-neon-high',
        status: 'done',
        content: '# Master Karar\nPWA olarak geliştir.',
        startedAt: Date.now(),
      },
      blueprint: {
        provider: 'antigravity',
        model: 'gemini-4-neon-medium',
        depth: 'concise',
        startedAt: Date.now(),
        files: [
          {
            id: 'f1',
            filename: '01_PRODUCT_VISION.md',
            title: 'Ürün Vizyonu',
            purpose: 'Kapsam',
            status: 'done',
            content: '# 01 Product Vision\nNet kapsam.',
            provider: 'antigravity',
            model: 'gemini-4-neon-medium',
          },
          {
            id: 'f2',
            filename: '05_AGENTS_START_HERE.md',
            title: 'Ajan Başlangıç',
            purpose: 'Kurallar',
            status: 'done',
            content: '# 05 Agents Start Here\nHard invariants.',
            provider: 'codex',
            model: 'gpt-6-luna',
          },
        ],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 1. Verify ZIP buffer contents
    const zipBuf = await buildBlueprintZipBuffer(session);
    const zip = await JSZip.loadAsync(zipBuf);
    const zipPaths = Object.keys(zip.files);
    expect(zipPaths.some((p) => p.endsWith('/README.md'))).toBe(true);
    expect(zipPaths.some((p) => p.endsWith('/AGENTS.md'))).toBe(true);
    expect(zipPaths.some((p) => p.endsWith('/MASTER_DECISION.md'))).toBe(true);
    expect(zipPaths.some((p) => p.endsWith('/01_PRODUCT_VISION.md'))).toBe(true);
    expect(zipPaths.some((p) => p.endsWith('/05_AGENTS_START_HERE.md'))).toBe(true);

    // 2. Verify Folder export writes AGENTS.md + all files
    const exported = saveBlueprintToFolder(session, tempExportDir);
    expect(exported.fileCount).toBe(5);
    expect(fs.existsSync(path.join(tempExportDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempExportDir, '01_PRODUCT_VISION.md'))).toBe(true);
    const bridge = fs.readFileSync(path.join(tempExportDir, 'AGENTS.md'), 'utf8');
    expect(bridge).toContain('01_PRODUCT_VISION.md');
    expect(bridge).toContain('05_AGENTS_START_HERE.md');
  });
});
