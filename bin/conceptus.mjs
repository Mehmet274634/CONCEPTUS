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
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024) req.destroy();
      });
      res.on('error', () => resolve(false));
      res.on('end', () => {
        try { resolve(res.statusCode === 200 && JSON.parse(body).name === 'CONCEPTUS'); }
        catch { resolve(false); }
      });
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
    spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function main() {
  const { port, openBrowser } = parseArgs(process.argv.slice(2));
  const url = `http://127.0.0.1:${port}`;

  process.chdir(ROOT_DIR);
  if (await checkHealth(port)) {
    console.log(`[CONCEPTUS] Zaten calisiyor: ${url}`);
    if (openBrowser) openUrl(url);
    console.log('Yeni tarayıcı profili için çalışan başlatıcının özel bağlantısını kullanın.');
    return;
  }

  const distIndex = path.join(ROOT_DIR, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.error('[CONCEPTUS] Hata: dist/index.html bulunamadi. Once `npm run build` calistir.');
    process.exit(1);
  }

  const { tsImport } = await import('tsx/esm/api');
  const { startConceptusServer } = await tsImport('../server/index.ts', import.meta.url);
  const { launchUrl } = await startConceptusServer({ port, distDir: path.dirname(distIndex) });
  console.log(launchUrl);
  if (openBrowser) openUrl(launchUrl);

}

main().catch((err) => {
  console.error('[CONCEPTUS] Baslatma hatasi:', err?.message || err);
  process.exit(1);
});
