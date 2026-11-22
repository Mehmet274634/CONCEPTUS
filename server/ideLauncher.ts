import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { DetectedIde, IdeId } from './types.ts';

const execFileAsync = promisify(execFile);

interface IdeSpec {
  id: IdeId;
  name: string;
  commands: string[];
  winFallbackPaths: () => string[];
}

function getWinProgramsRoots(): string[] {
  return [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : '',
    process.env.ProgramFiles || '',
    process.env['ProgramFiles(x86)'] || '',
  ].filter(Boolean);
}

const IDE_SPECS: IdeSpec[] = [
  {
    id: 'antigravity',
    name: 'Antigravity',
    commands: ['antigravity', 'agy'],
    winFallbackPaths: () =>
      getWinProgramsRoots().flatMap((r) => [
        path.join(r, 'antigravity', 'Antigravity.exe'),
        path.join(r, 'Antigravity', 'Antigravity.exe'),
        path.join(r, 'Antigravity IDE', 'Antigravity.exe'),
        path.join(r, 'antigravity', 'bin', 'antigravity.cmd'),
      ]),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    commands: ['cursor'],
    winFallbackPaths: () =>
      getWinProgramsRoots().flatMap((r) => [
        path.join(r, 'cursor', 'Cursor.exe'),
        path.join(r, 'Cursor', 'Cursor.exe'),
        path.join(r, 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
      ]),
  },
  {
    id: 'vscode',
    name: 'VS Code',
    commands: ['code'],
    winFallbackPaths: () =>
      getWinProgramsRoots().flatMap((r) => [
        path.join(r, 'Microsoft VS Code', 'Code.exe'),
        path.join(r, 'Microsoft VS Code', 'bin', 'code.cmd'),
      ]),
  },
];

let cachedIdes: { at: number; list: DetectedIde[] } | null = null;
const IDE_CACHE_MS = 5 * 60 * 1000;

async function findExecutable(cmd: string): Promise<string | null> {
  const isWin = process.platform === 'win32';
  const lookup = isWin ? 'where.exe' : 'which';
  try {
    const { stdout } = await execFileAsync(lookup, [cmd], { timeout: 3000 });
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;

    if (isWin) {
      // Never pick extensionless POSIX bash shims (e.g. ".../bin/cursor") over native .exe/.cmd on Windows
      const exe = lines.find((l) => /\.exe$/i.test(l));
      if (exe) return exe;
      const cmdShim = lines.find((l) => /\.(cmd|bat|com)$/i.test(l));
      if (cmdShim) return cmdShim;
      return null;
    }

    return lines[0];
  } catch {
    return null;
  }
}

async function resolveIdeExecutable(spec: IdeSpec): Promise<string | null> {
  if (process.platform === 'win32') {
    // Prefer native Windows .exe directly (handles spaces & Unicode folder paths cleanly with shell:false)
    for (const candidate of spec.winFallbackPaths()) {
      if (/\.exe$/i.test(candidate) && fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  for (const cmd of spec.commands) {
    const found = await findExecutable(cmd);
    if (found) return found;
  }

  if (process.platform === 'win32') {
    for (const candidate of spec.winFallbackPaths()) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

export async function detectInstalledIdes(force = false): Promise<DetectedIde[]> {
  if (!force && cachedIdes && Date.now() - cachedIdes.at < IDE_CACHE_MS) {
    return cachedIdes.list;
  }

  const results: DetectedIde[] = [];
  for (const spec of IDE_SPECS) {
    const resolved = await resolveIdeExecutable(spec);
    results.push({
      id: spec.id,
      name: spec.name,
      installed: Boolean(resolved),
      command: resolved || spec.commands[0],
    });
  }

  cachedIdes = { at: Date.now(), list: results };
  return results;
}

/**
 * Security-hardened folder opener for installed IDEs (strict directory check + strict allowlist + shell:false).
 */
export async function openFolderInIde(
  folderPath: string,
  ide: IdeId | 'explorer'
): Promise<{ ok: boolean; error?: string }> {
  const raw = String(folderPath || '').trim();
  if (!raw) return { ok: false, error: 'Geçerli bir klasör yolu belirtilmedi.' };

  let resolvedDir: string;
  try {
    resolvedDir = path.resolve(raw);
    const stat = fs.statSync(resolvedDir);
    if (!stat.isDirectory()) {
      return { ok: false, error: 'Belirtilen yol geçerli bir klasör değil.' };
    }
  } catch {
    return { ok: false, error: 'Klasör bulunamadı.' };
  }

  if (ide === 'explorer') {
    const cmd =
      process.platform === 'win32'
        ? 'explorer.exe'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open';
    const child = spawn(cmd, [resolvedDir], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return { ok: true };
  }

  const allowedIds: IdeId[] = ['antigravity', 'cursor', 'vscode'];
  if (!allowedIds.includes(ide)) {
    return { ok: false, error: 'Desteklenmeyen IDE seçimi.' };
  }

  const ides = await detectInstalledIdes();
  const match = ides.find((x) => x.id === ide && x.installed && x.command);
  if (!match || !match.command) {
    return { ok: false, error: `${ide} bu bilgisayarda kurulu bulunamadı.` };
  }

  // On Windows, .cmd/.bat shims need cmd.exe /d /s /c with an outer quoted command line
  const isWinCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(match.command);
  const child = isWinCmd
    ? spawn(
        'cmd.exe',
        ['/d', '/s', '/c', `""${match.command.replace(/"/g, '')}" "${resolvedDir.replace(/"/g, '')}""`],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          windowsVerbatimArguments: true,
        }
      )
    : spawn(match.command, [resolvedDir], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
  child.unref();
  return { ok: true };
}
