import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { startConceptusServer } from '../server/index.ts';
import { runCliSeatWithFallback } from '../server/fallback.ts';

vi.mock('../server/discovery.ts', async (load) => ({
  ...await load<typeof import('../server/discovery.ts')>(),
  prewarmProviders: () => {},
}));
vi.mock('../server/fallback.ts', async (load) => ({
  ...await load<typeof import('../server/fallback.ts')>(),
  runCliSeatWithFallback: vi.fn(),
}));

it('guards writes during a round, drains cancellation, and deletes only after workers finish', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conceptus-lifecycle-'));
  vi.stubEnv('CONCEPTUS_DATA_DIR', dir);
  const { server, url, launchUrl } = await startConceptusServer({ port: 0 });
  const token = new URLSearchParams(new URL(launchUrl).hash.slice(1)).get('access');
  const request = (route: string, method = 'GET', body?: unknown) => fetch(url + '/api/sessions' + route, {
    method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  vi.mocked(runCliSeatWithFallback).mockImplementation(({ signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => setTimeout(() => reject(new Error('ABORTED')), 20), { once: true });
  }));
  try {
    const created = await request('', 'POST', {
      idea: 'A reproducible integration test', limitProviders: true,
      seats: [{ provider: 'codex', model: 'default', enabled: true }],
    });
    expect(created.status).toBe(201);
    const { session } = await created.json();
    expect(session.allowedProviders).toEqual(['codex']);
    const route = '/' + session.id;
    expect((await request(route + '/rounds', 'POST')).status).toBe(202);
    expect((await request(route, 'PATCH', { title: 'racing change' })).status).toBe(409);
    expect((await request(route + '/abort', 'POST')).status).toBe(200);
    expect((await request(route, 'PATCH', { title: 'saved change' })).status).toBe(200);
    expect((await request(route + '/rounds', 'POST')).status).toBe(202);
    expect(await (await request(route, 'DELETE')).json()).toEqual({ ok: true });
    expect((await request(route)).status).toBe(404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
