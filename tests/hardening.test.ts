import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSecretFilename, redactSecrets } from '../server/repoContext.ts';
import { deleteSession, loadSession, saveSession, writeFileAtomic } from '../server/storage.ts';
import {
  isBlockedUploadFilename,
  redactUploadedSecrets,
} from '../src/utils/fileSafety.ts';

describe('v5.3.1 Hardening — Atomic Storage, Secret Redaction & HTTP API Integration', () => {
  let server: Server | null = null;
  let baseUrl = '';
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    process.env.CONCEPTUS_EMBEDDED = '1';
    const { startConceptusServer } = await import('../server/index.ts');
    const started = await startConceptusServer({ port: 0 });
    server = started.server;
    baseUrl = started.url;
  });

  afterAll(async () => {
    for (const id of createdSessionIds) {
      deleteSession(id);
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it('writes files atomically without leaving leftover .tmp files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conceptus-atomic-'));
    try {
      const target = path.join(tmpDir, 'session.json');
      writeFileAtomic(target, JSON.stringify({ ok: true, step: 1 }));
      writeFileAtomic(target, JSON.stringify({ ok: true, step: 2 }));

      const entries = fs.readdirSync(tmpDir);
      expect(entries).toEqual(['session.json']);
      expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ ok: true, step: 2 });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('persists and reloads sessions cleanly via atomic saveSession', () => {
    const id = `cpt_atomic_${Date.now().toString(36)}`;
    createdSessionIds.push(id);
    saveSession({
      id,
      title: 'Atomik Test',
      idea: 'Atomik kayıt doğrulama fikri',
      domain: 'app_product',
      constraints: '',
      contextText: '',
      seats: [],
      rounds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const loaded = loadSession(id);
    expect(loaded?.id).toBe(id);
    expect(loaded?.title).toBe('Atomik Test');
  });

  it('blocks sensitive filenames and redacts extended token/key formats on both server and client', () => {
    for (const bad of ['.env', '.env.production', 'cert.pem', 'id_rsa', 'service-account-prod.json', 'my-secret.txt']) {
      expect(isSecretFilename(bad)).toBe(true);
      expect(isBlockedUploadFilename(bad)).toBe(true);
    }
    expect(isBlockedUploadFilename('ARCHITECTURE.md')).toBe(false);

    const sample = [
      'OPENAI_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456',
      'ANTHROPIC=sk-ant-abcdefghijklmnopqrstuvwxyz123456',
      'AWS=AKIAIOSFODNN7EXAMPLE',
      'GH=github_pat_11ABCDEF123456789012345678901234567890',
      'SLACK=xoxb-123456789012-123456789012-abcdefghijkl',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAtoken\n-----END RSA PRIVATE KEY-----',
    ].join('\n');

    const serverRedacted = redactSecrets(sample);
    expect(serverRedacted).not.toContain('sk-proj-');
    expect(serverRedacted).not.toContain('sk-ant-');
    expect(serverRedacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(serverRedacted).not.toContain('github_pat_');
    expect(serverRedacted).not.toContain('xoxb-');
    expect(serverRedacted).not.toContain('MIIEpAIBAAKCAQEAtoken');

    const clientResult = redactUploadedSecrets(sample);
    expect(clientResult.redactedCount).toBeGreaterThanOrEqual(6);
    expect(clientResult.text).not.toContain('sk-ant-');
    expect(clientResult.text).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(clientResult.text).not.toContain('MIIEpAIBAAKCAQEAtoken');
  });

  it('rejects malformed non-string payloads with 400 and blocks cross-origin requests with 403', async () => {
    // 1. Cross-origin AND foreign localhost port requests must BOTH be blocked with 403 JSON
    const crossOrigin = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(crossOrigin.status).toBe(403);

    const foreignLocalhost = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Origin: 'http://localhost:9999' },
    });
    expect(foreignLocalhost.status).toBe(403);

    // Own bound origin must be allowed
    const ownOrigin = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Origin: baseUrl },
    });
    expect(ownOrigin.status).toBe(200);

    // 2. Non-string constraints / idea, >6 seats, or invalid seat provider must return clean 400
    const badConstraints = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idea: 'Valid idea text here',
        constraints: { nested: 'not a string' },
      }),
    });
    expect(badConstraints.status).toBe(400);

    const badIdea = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: 12345 }),
    });
    expect(badIdea.status).toBe(400);

    const tooManySeats = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idea: 'Valid idea',
        seats: Array.from({ length: 7 }, (_, i) => ({
          id: `s${i}`,
          label: `Seat ${i}`,
          provider: 'antigravity',
          model: 'auto',
          role: 'general',
          effort: 'default',
          economyMode: false,
          enabled: true,
        })),
      }),
    });
    expect(tooManySeats.status).toBe(400);

    const badProviderSeat = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idea: 'Valid idea',
        seats: [{ id: 's1', provider: 'evil_shell', model: 'x' }],
      }),
    });
    expect(badProviderSeat.status).toBe(400);

    // 3. Valid session creation returns 201 and persists targetCodingTools + projectMode
    const validRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idea: 'Karmaşık çoklu kiracılı fatura yönetim ve otomatik hatırlatma SaaS uygulaması.',
        domain: 'app_product',
        projectMode: 'existing_feature',
        targetCodingTools: ['antigravity', 'codex'],
        constraints: 'Mevcut testler kırılmamalı.',
        contextText: '',
        seats: [],
      }),
    });
    expect(validRes.status).toBe(201);
    const createdJson = (await validRes.json()) as { session: any };
    expect(createdJson.session.projectMode).toBe('existing_feature');
    expect(createdJson.session.targetCodingTools).toEqual(['antigravity', 'codex']);
    createdSessionIds.push(createdJson.session.id);

    // 4. Health & IDE detection endpoints return 200
    const healthRes = await fetch(`${baseUrl}/api/providers/health`);
    expect(healthRes.status).toBe(200);
    const idesRes = await fetch(`${baseUrl}/api/system/ides`);
    expect(idesRes.status).toBe(200);
  });
});
