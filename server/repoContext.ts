import fs from 'node:fs';
import path from 'node:path';
import type { RepoSnapshotMeta } from './types.ts';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  'out',
  'coverage',
  '.cache',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'bin',
  'obj',
  '.idea',
  '.vscode',
  'vendor',
  'data',
  'exports',
]);

const SECRET_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /secret/i,
  /credential/i,
  /token\.json$/i,
  /\.keystore$/i,
  /service[-_]?account.*\.json$/i,
];

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.cs',
  '.cpp',
  '.c',
  '.h',
  '.sql',
  '.prisma',
  '.graphql',
  '.yaml',
  '.yml',
  '.toml',
  '.css',
  '.scss',
  '.html',
  '.vue',
  '.svelte',
  '.astro',
  '.sh',
  '.ps1',
  '.dockerfile',
]);

const PRIORITY_NAMES = [
  'readme.md',
  'package.json',
  'pyproject.toml',
  'cargo.toml',
  'go.mod',
  'tsconfig.json',
  'prisma/schema.prisma',
  'docker-compose.yml',
  'agents.md',
  'claude.md',
];

export function isSecretFilename(name: string): boolean {
  return SECRET_FILE_PATTERNS.some((re) => re.test(name));
}

export function redactSecrets(text: string): string {
  return text
    .replace(
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
      '[REDACTED_PRIVATE_KEY]'
    )
    .replace(/\b(sk-(?:ant-|proj-|live-|test-)?[a-zA-Z0-9_-]{20,})\b/g, '[REDACTED_API_KEY]')
    .replace(/\b(rk_live_[a-zA-Z0-9_-]{16,})\b/g, '[REDACTED_API_KEY]')
    .replace(/\b(AIza[0-9A-Za-z_-]{30,})\b/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/\b((?:ghp|gho|ghu|ghs)_[a-zA-Z0-9]{25,}|github_pat_[a-zA-Z0-9_]{30,})\b/g, '[REDACTED_GH_TOKEN]')
    .replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[REDACTED_AWS_KEY]')
    .replace(/\b(xox[bpoa]-[a-zA-Z0-9-]{16,})\b/g, '[REDACTED_SLACK_TOKEN]')
    .replace(/\b(Bearer\s+[a-zA-Z0-9._-]{24,})\b/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(
      /(api[_-]?key|secret|password|passwd|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*["'][^"'\r\n]{8,}["']/gi,
      '$1: "[REDACTED]"'
    );
}

function isReadableTextFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile' || lower === 'makefile') return true;
  if (lower.endsWith('lock.json') || lower.endsWith('.lock') || lower.endsWith('.min.js')) {
    return false;
  }
  const ext = path.extname(lower);
  return TEXT_EXTENSIONS.has(ext);
}

function scoreFilePriority(relPath: string): number {
  const lower = relPath.replace(/\\/g, '/').toLowerCase();
  const idx = PRIORITY_NAMES.indexOf(lower);
  if (idx >= 0) return 1000 - idx * 10;
  if (lower.startsWith('docs/') && lower.endsWith('.md')) return 600;
  if (/\/(index|main|app|server|schema|types|router)\.[a-z]+$/i.test(lower)) return 450;
  if (lower.endsWith('.sql') || lower.endsWith('.prisma')) return 500;
  if (lower.startsWith('src/') || lower.startsWith('server/') || lower.startsWith('app/')) {
    return 250 - lower.split('/').length * 20;
  }
  return 100 - lower.split('/').length * 15;
}

export function scanLocalRepo(folderPath: string): {
  meta: RepoSnapshotMeta;
  snapshotText: string;
} {
  const resolved = path.resolve(folderPath.trim());
  if (!fs.existsSync(resolved)) {
    throw new Error(`Klasör bulunamadı: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Belirtilen yol bir klasör değil: ${resolved}`);
  }

  const rootName = path.basename(resolved);
  const treeLines: string[] = [];
  const candidateFiles: { relPath: string; fullPath: string; size: number; score: number }[] = [];
  let totalFilesScanned = 0;

  function walk(dir: string, relPrefix: string, depth: number) {
    if (depth > 4 || treeLines.length > 220) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const indent = '  '.repeat(depth);
    for (const entry of entries) {
      if (treeLines.length > 220) break;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        treeLines.push(`${indent}${entry.name}/`);
        walk(
          path.join(dir, entry.name),
          relPrefix ? `${relPrefix}/${entry.name}` : entry.name,
          depth + 1
        );
      } else if (entry.isFile()) {
        if (isSecretFilename(entry.name)) continue;
        totalFilesScanned++;
        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        treeLines.push(`${indent}${entry.name}`);

        if (isReadableTextFile(entry.name)) {
          try {
            const fullPath = path.join(dir, entry.name);
            const fstat = fs.statSync(fullPath);
            if (fstat.size > 0 && fstat.size <= 80_000) {
              candidateFiles.push({
                relPath: rel,
                fullPath,
                size: fstat.size,
                score: scoreFilePriority(rel),
              });
            }
          } catch {
            // ignore unreadable
          }
        }
      }
    }
  }

  walk(resolved, '', 0);

  candidateFiles.sort((a, b) => b.score - a.score || a.size - b.size);

  const MAX_TOTAL_CHARS = 18_000;
  const MAX_SINGLE_FILE = 3_000;
  const MAX_FILES_CONTENT = 10;

  const sections: string[] = [
    `## BAĞLI PROJE KLASÖRÜ: \`${rootName}\``,
    `*(Salt-okunur tarama · Gizli anahtar/.env dosyaları otomatik dışlandı)*`,
    '',
    '### Dosya Ağacı',
    '```text',
    treeLines.slice(0, 180).join('\n'),
    '```',
  ];

  let usedChars = sections.join('\n').length;
  const includedFiles: string[] = [];

  for (const file of candidateFiles) {
    if (includedFiles.length >= MAX_FILES_CONTENT) break;
    if (usedChars >= MAX_TOTAL_CHARS) break;

    try {
      const raw = fs.readFileSync(file.fullPath, 'utf8');
      if (raw.includes('\0')) continue; // skip binary disguised as text
      const safe = redactSecrets(raw);
      const budget = Math.min(MAX_SINGLE_FILE, MAX_TOTAL_CHARS - usedChars);
      if (budget < 250) break;
      const snippet =
        safe.length > budget ? safe.slice(0, budget) + '\n...[kısaltıldı]' : safe;
      sections.push('', `### Dosya: \`${file.relPath}\``, '```', snippet, '```');
      usedChars += snippet.length + 40;
      includedFiles.push(file.relPath);
    } catch {
      // skip
    }
  }

  const snapshotText = sections.join('\n');
  return {
    meta: {
      folderPath: resolved,
      rootName,
      totalFilesScanned,
      includedFiles,
      totalChars: snapshotText.length,
    },
    snapshotText,
  };
}
