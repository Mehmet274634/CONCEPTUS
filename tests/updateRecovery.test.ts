import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('retries a failed build after git has already advanced', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conceptus-upgrade-'));
  const origin = path.join(root, 'origin');
  const clone = path.join(root, 'clone');
  const env = { ...process.env, CONCEPTUS_EMBEDDED: '0', GIT_AUTHOR_NAME: 'Test',
    GIT_COMMITTER_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@localhost', GIT_COMMITTER_EMAIL: 'test@localhost' };
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, stdio: 'pipe' });
  try {
    fs.mkdirSync(origin);
    git(origin, 'init', '-b', 'main');
    fs.writeFileSync(path.join(origin, 'package.json'), JSON.stringify({
      name: 'update-fixture', version: '1.0.0', scripts: { build: 'node build.cjs' },
    }));
    fs.writeFileSync(path.join(origin, 'build.cjs'), "if (!require('fs').existsSync('.git/allow-build')) process.exit(1)");
    git(origin, 'add', '.');
    git(origin, 'commit', '-m', 'initial');
    git(root, 'clone', origin, clone);
    fs.writeFileSync(path.join(origin, 'README.md'), 'New release');
    git(origin, 'add', '.');
    git(origin, 'commit', '-m', 'update');

    const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    const updater = pathToFileURL(path.resolve('server/updater.ts')).href;
    const script = 'const { runLocalGitSelfUpdate } = await import(' + JSON.stringify(updater) +
      '); console.log(JSON.stringify(await runLocalGitSelfUpdate()))';
    function update() {
      return JSON.parse(execFileSync(process.execPath, ['--import', loader, '--input-type=module', '-e', script],
        { cwd: clone, env, encoding: 'utf8' }));
    }
    expect(update().ok).toBe(false);
    fs.writeFileSync(path.join(clone, '.git', 'allow-build'), '');
    expect(update()).toMatchObject({ ok: true, restartRequired: true });
    expect(update()).toMatchObject({ ok: true, restartRequired: false });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 45000);
