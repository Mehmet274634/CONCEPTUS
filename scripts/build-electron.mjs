import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist-electron');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Bundle Electron Main + Embedded Express Backend into single fast CommonJS file
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'electron', 'main.ts')],
    outfile: path.join(OUT_DIR, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: false,
    minify: false,
    logLevel: 'info',
  });

  // 2. Bundle Sandboxed Preload Script
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'electron', 'preload.ts')],
    outfile: path.join(OUT_DIR, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: false,
    minify: false,
    logLevel: 'info',
  });

  console.log('ELECTRON_BUNDLE_OK:', OUT_DIR);
}

main().catch((err) => {
  console.error('ELECTRON_BUNDLE_FAILED:', err);
  process.exit(1);
});
