#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
  let port = Number(process.env.PORT || 3847);
  let openBrowser = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-open') openBrowser = false;
    else if (arg === '--port' && argv[i + 1]) {
      const p = Number(argv[i + 1]);
      if (Number.isInteger(p) && p > 0 && p < 65536) port = p;
      i++;
    } else if (arg.startsWith('--port=')) {
      const p = Number(arg.slice('--port='.length));
      if (Number.isInteger(p) && p > 0 && p < 65536) port = p;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
CONCEPTUS — Local Multi-AI Idea Evolution & Blueprint Studio

Usage:
  conceptus [--port 3847] [--no-open]

Options:
  --port <number>   Port to bind on 127.0.0.1 (default: 3847)
  --no-open         Do not automatically open the browser
  -h, --help        Show this help message
`);
      process.exit(0);
    }
  }
  return { port, openBrowser };
}

function checkHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1200 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function openUrl(url) {
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function main() {
  const { port, openBrowser } = parseArgs(process.argv.slice(2));
  const url = `http://127.0.0.1:${port}`;

  if (await checkHealth(port)) {
    console.log(`[CONCEPTUS] Zaten calisiyor: ${url}`);
    if (openBrowser) openUrl(url);
    return;
  }

  const distIndex = path.join(ROOT_DIR, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.error('[CONCEPTUS] Hata: dist/index.html bulunamadi. Once `npm run build` calistir.');
    process.exit(1);
  }

  const tsxBin = path.join(
    ROOT_DIR,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );
  const serverEntry = path.join(ROOT_DIR, 'server', 'index.ts');

  const child = spawn(tsxBin, [serverEntry, '--serve'], {
    cwd: ROOT_DIR,
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (openBrowser) {
    const start = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - start > 15_000) {
        clearInterval(timer);
        return;
      }
      if (await checkHealth(port)) {
        clearInterval(timer);
        openUrl(url);
      }
    }, 350);
  }

  const shutdown = () => {
    child.kill('SIGTERM');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error('[CONCEPTUS] Baslatma hatasi:', err?.message || err);
  process.exit(1);
});
