import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanLocalRepo } from '../server/repoContext.ts';

describe('Read-Only Secret-Filtered Repo Scanner', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conceptus-repo-test-'));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'pkg'), { recursive: true });

    // Legitimate code files
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'demo-app', version: '1.0.0' }, null, 2)
    );
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Demo App\nClean readme.');
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const hello = "world";\n');

    // Sensitive files that MUST be strictly excluded
    fs.writeFileSync(path.join(tempDir, '.env'), 'OPENAI_API_KEY=sk-secret123456\n');
    fs.writeFileSync(path.join(tempDir, '.env.local'), 'DB_PASSWORD=supersecret\n');
    fs.writeFileSync(path.join(tempDir, 'id_rsa'), '-----BEGIN PRIVATE KEY-----\nSECRET\n');
    fs.writeFileSync(path.join(tempDir, 'credentials.json'), '{"private_key":"secret"}');
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('includes legitimate project files and strictly blocks secrets & node_modules', () => {
    const result = scanLocalRepo(tempDir);

    expect(result.meta.includedFiles).toContain('package.json');
    expect(result.meta.includedFiles).toContain('README.md');
    expect(result.meta.includedFiles.some((f) => f.includes('index.ts'))).toBe(true);

    expect(result.snapshotText).not.toContain('sk-secret123456');
    expect(result.snapshotText).not.toContain('supersecret');
    expect(result.snapshotText).not.toContain('BEGIN PRIVATE KEY');
    expect(result.meta.includedFiles.some((f) => f.includes('.env'))).toBe(false);
    expect(result.meta.includedFiles.some((f) => f.includes('credentials'))).toBe(false);
    expect(result.meta.includedFiles.some((f) => f.includes('node_modules'))).toBe(false);
  });
});
