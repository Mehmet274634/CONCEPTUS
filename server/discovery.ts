import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getProvidersCachePath } from './paths.ts';
import type { ModelOption, ProviderAuthStatus, ProviderId, ProviderInfo } from './types.ts';

const execFileAsync = promisify(execFile);

const MEMORY_TTL_MS = 10 * 60 * 1000;

let cachedProviders: ProviderInfo[] | null = null;
let cachedAt = 0;
let inflightRefresh: Promise<ProviderInfo[]> | null = null;

function readDiskCache(): { providers: ProviderInfo[]; updatedAt: number } | null {
  try {
    const cacheFile = getProvidersCachePath();
    if (!fs.existsSync(cacheFile)) return null;
    const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (Array.isArray(parsed?.providers) && parsed.providers.length > 0) {
      return {
        providers: parsed.providers as ProviderInfo[],
        updatedAt: Number(parsed.updatedAt || 0),
      };
    }
  } catch {
    // ignore corrupt cache
  }
  return null;
}

function writeDiskCache(providers: ProviderInfo[]) {
  try {
    const cacheFile = getProvidersCachePath();
    const dir = path.dirname(cacheFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({ updatedAt: Date.now(), providers }, null, 2),
      'utf8'
    );
  } catch {
    // ignore write failure
  }
}

async function resolveCommand(
  cmd: string,
  extraCandidates: string[] = []
): Promise<string | undefined> {
  // Fast-path: check known direct paths first before spawning where.exe!
  for (const candidate of extraCandidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('where.exe', [cmd], { timeout: 3000 });
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const exe = lines.find((l) => l.toLowerCase().endsWith('.exe'));
      if (exe) return exe;
      const cmdFile = lines.find((l) => l.toLowerCase().endsWith('.cmd'));
      if (cmdFile) return cmdFile;
      if (lines[0]) return lines[0];
    } else {
      const { stdout } = await execFileAsync('which', [cmd], { timeout: 3000 });
      const first = stdout.trim().split(/\r?\n/)[0];
      if (first) return first;
    }
  } catch {
    // not found
  }
  return undefined;
}

async function runQuickCommand(
  resolvedPath: string,
  args: string[],
  timeout = 7000
): Promise<string> {
  const isCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedPath);
  const { stdout, stderr } = await execFileAsync(
    isCmd ? 'cmd.exe' : resolvedPath,
    isCmd ? ['/c', resolvedPath, ...args] : args,
    { timeout, windowsHide: true }
  );
  return (stdout || stderr || '').trim();
}

function readClaudeModels(): ModelOption[] {
  const models: ModelOption[] = [
    { id: 'default', label: 'Varsayılan (Claude)', description: '~/.claude/settings.json varsayılanı' },
    { id: 'opus', label: 'Claude Opus', description: 'Derin strateji, mimari ve sentez' },
    { id: 'sonnet', label: 'Claude Sonnet', description: 'Hız ve kalite dengesi' },
    { id: 'fable', label: 'Claude Fable', description: 'Yeni nesil alias' },
    { id: 'haiku', label: 'Claude Haiku', description: 'Ultra hızlı / düşük kota' },
  ];

  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const modelSettings = raw?.modelSettings;
      if (modelSettings && typeof modelSettings === 'object') {
        for (const key of Object.keys(modelSettings)) {
          if (!models.some((m) => m.id === key)) {
            models.push({ id: key, label: key });
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return models;
}

function readCodexModels(): ModelOption[] {
  const models: ModelOption[] = [
    { id: 'default', label: 'Varsayılan (Codex)', description: '~/.codex/config.toml varsayılanı' },
  ];

  try {
    const cachePath = path.join(os.homedir(), '.codex', 'models_cache.json');
    if (fs.existsSync(cachePath)) {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const list = Array.isArray(raw?.models) ? raw.models : [];
      for (const m of list) {
        if (!m?.slug || m.visibility === 'hide') continue;
        if (!models.some((x) => x.id === m.slug)) {
          models.push({
            id: m.slug,
            label: m.display_name || m.slug,
            description: m.description,
          });
        }
      }
    }
  } catch {
    // ignore
  }

  if (models.length === 1) {
    models.push(
      { id: 'gpt-6-luna', label: 'GPT-6-Luna' },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' }
    );
  }

  return models;
}

async function readGeminiModels(resolvedPath?: string): Promise<ModelOption[]> {
  const fallback: ModelOption[] = [
    { id: 'auto', label: 'Auto' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  ];
  if (!resolvedPath) return fallback;

  try {
    const out = await runQuickCommand(resolvedPath, ['--list-models'], 6000);
    const parsed: ModelOption[] = [];
    for (const line of out.split(/\r?\n/)) {
      const match = line.match(/^([a-zA-Z0-9._-]+)\s+\(([^)]+)\)/);
      if (match && !parsed.some((m) => m.id === match[1].trim())) {
        parsed.push({ id: match[1].trim(), label: match[2].trim() });
      }
    }
    return parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function readAntigravityModels(resolvedPath?: string): Promise<ModelOption[]> {
  const fallback: ModelOption[] = [
    { id: 'auto', label: 'Varsayılan (Antigravity)' },
    { id: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)' },
    { id: 'gemini-4-neon-xhigh', label: 'Gemini 4 Neon (XHigh)' },
    { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)' },
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
    { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)' },
    { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)' },
    { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
  ];

  if (!resolvedPath) return fallback;

  try {
    const out = await runQuickCommand(resolvedPath, ['models'], 9000);
    const parsed: ModelOption[] = [
      { id: 'auto', label: 'Varsayılan (Antigravity)' },
    ];
    for (const rawLine of out.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.toLowerCase().startsWith('fetching')) continue;
      const tabParts = line.split('\t').map((p) => p.trim()).filter(Boolean);
      if (tabParts.length >= 2) {
        const [id, label] = tabParts;
        if (!parsed.some((m) => m.id === id)) {
          parsed.push({ id, label });
        }
      } else {
        const match = line.match(/^([a-zA-Z0-9._-]+)\s+(.+)$/);
        if (match && !parsed.some((m) => m.id === match[1])) {
          parsed.push({ id: match[1], label: match[2].trim() });
        }
      }
    }
    return parsed.length > 1 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function readClaudeAuthStatus(
  resolvedPath?: string
): Promise<ProviderAuthStatus | undefined> {
  if (!resolvedPath) return undefined;
  try {
    const out = await runQuickCommand(resolvedPath, ['auth', 'status'], 7500);
    const jsonMatch = out.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return undefined;
    const parsed = JSON.parse(jsonMatch[0]);
    const loggedIn = Boolean(parsed?.loggedIn);
    const rawTier = String(parsed?.planTier || parsed?.subscriptionType || '').trim();
    const planLabel = rawTier
      ? `Claude ${rawTier.charAt(0).toUpperCase()}${rawTier.slice(1)}`
      : loggedIn
        ? 'Bağlı'
        : undefined;
    return { loggedIn, planLabel };
  } catch {
    return undefined;
  }
}

async function readCodexAuthStatus(
  resolvedPath?: string
): Promise<ProviderAuthStatus | undefined> {
  if (!resolvedPath) return undefined;
  try {
    const out = await runQuickCommand(resolvedPath, ['login', 'status'], 7500);
    const lower = out.toLowerCase();
    const loggedIn = lower.includes('logged in');
    const planLabel = lower.includes('chatgpt')
      ? 'ChatGPT'
      : lower.includes('api')
        ? 'API Key'
        : loggedIn
          ? 'Bağlı'
          : undefined;
    return { loggedIn, planLabel };
  } catch {
    return undefined;
  }
}

async function scanProvidersNow(): Promise<ProviderInfo[]> {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const appData =
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

  const [claudePath, agyPath, codexPath, geminiPath] = await Promise.all([
    resolveCommand('claude', [
      path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
      path.join(os.homedir(), '.local', 'bin', 'claude'),
    ]),
    resolveCommand('agy', [
      path.join(localAppData, 'agy', 'bin', 'agy.exe'),
      path.join(os.homedir(), '.local', 'bin', 'agy'),
    ]),
    resolveCommand('codex', [path.join(appData, 'npm', 'codex.cmd')]),
    resolveCommand('gemini', [path.join(appData, 'npm', 'gemini.cmd')]),
  ]);

  const [
    claudeVer,
    agyVer,
    codexVer,
    geminiVer,
    agyModels,
    geminiModels,
    claudeAuth,
    codexAuth,
  ] = await Promise.all([
    claudePath
      ? runQuickCommand(claudePath, ['--version']).catch(() => undefined)
      : Promise.resolve(undefined),
    agyPath
      ? runQuickCommand(agyPath, ['--version']).catch(() => undefined)
      : Promise.resolve(undefined),
    codexPath
      ? runQuickCommand(codexPath, ['--version']).catch(() => undefined)
      : Promise.resolve(undefined),
    geminiPath
      ? runQuickCommand(geminiPath, ['--version']).catch(() => undefined)
      : Promise.resolve(undefined),
    readAntigravityModels(agyPath),
    readGeminiModels(geminiPath),
    readClaudeAuthStatus(claudePath),
    readCodexAuthStatus(codexPath),
  ]);

  const providers: ProviderInfo[] = [
    {
      id: 'antigravity',
      name: 'Antigravity',
      command: 'agy',
      installed: Boolean(agyPath),
      resolvedPath: agyPath,
      version: agyVer?.split(/\r?\n/)[0],
      models: agyModels,
      supportsEffort: true,
      effortOptions: ['default', 'low', 'medium', 'high', 'max'],
      installHint: 'irm https://antigravity.google/cli/install.ps1 | iex',
      note: 'Google Antigravity aboneliği (Gemini, Claude, GPT-OSS havuzu).',
      authStatus: agyPath
        ? { loggedIn: true, planLabel: 'Antigravity' }
        : undefined,
    },
    {
      id: 'claude',
      name: 'Claude Code',
      command: 'claude',
      installed: Boolean(claudePath),
      resolvedPath: claudePath,
      version: claudeVer?.split(/\r?\n/)[0],
      models: readClaudeModels(),
      supportsEffort: true,
      effortOptions: ['default', 'low', 'medium', 'high', 'max'],
      installHint: 'npm install -g @anthropic-ai/claude-code',
      note: 'Claude Pro / Max aboneliği ile sıfır ek maliyet.',
      authStatus: claudeAuth,
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      command: 'codex',
      installed: Boolean(codexPath),
      resolvedPath: codexPath,
      version: codexVer?.split(/\r?\n/)[0],
      models: readCodexModels(),
      supportsEffort: true,
      effortOptions: ['default', 'low', 'medium', 'high'],
      installHint: 'npm install -g @openai/codex',
      note: 'ChatGPT / Codex hesabı. Ücretsiz planda Ekonomik Mod önerilir.',
      authStatus: codexAuth,
    },
    {
      id: 'gemini',
      name: 'Gemini CLI',
      command: 'gemini',
      installed: Boolean(geminiPath),
      resolvedPath: geminiPath,
      version: geminiVer?.split(/\r?\n/)[0],
      models: geminiModels,
      supportsEffort: false,
      installHint: 'npm install -g @google/gemini-cli',
      note: 'Kurumsal/API hesaplar için; bireysel hesaplar Antigravity CLI kullanır.',
      authStatus: geminiPath ? { loggedIn: true, planLabel: 'Gemini CLI' } : undefined,
    },
  ];

  cachedProviders = providers;
  cachedAt = Date.now();
  writeDiskCache(providers);
  return providers;
}

export async function discoverProviders(forceRefresh = false): Promise<ProviderInfo[]> {
  if (forceRefresh) {
    if (!inflightRefresh) {
      inflightRefresh = scanProvidersNow().finally(() => {
        inflightRefresh = null;
      });
    }
    return inflightRefresh;
  }

  // 1. Instant memory hit (stale-while-revalidate: <1ms even if background refresh is running!)
  if (cachedProviders) {
    if (Date.now() - cachedAt >= MEMORY_TTL_MS && !inflightRefresh) {
      inflightRefresh = scanProvidersNow().finally(() => {
        inflightRefresh = null;
      });
    }
    return cachedProviders;
  }

  // 2. Instant disk cache hit (<3ms) + silent background refresh if stale
  const disk = readDiskCache();
  if (disk) {
    cachedProviders = disk.providers;
    cachedAt = disk.updatedAt;
    if (Date.now() - disk.updatedAt >= MEMORY_TTL_MS && !inflightRefresh) {
      inflightRefresh = scanProvidersNow().finally(() => {
        inflightRefresh = null;
      });
    }
    return cachedProviders;
  }

  // 3. First-time cold scan
  if (!inflightRefresh) {
    inflightRefresh = scanProvidersNow().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

export async function getProviderById(id: ProviderId): Promise<ProviderInfo | undefined> {
  const all = await discoverProviders(false);
  return all.find((p) => p.id === id);
}

// Warm up cache in background when server boots
export function prewarmProviders() {
  const disk = readDiskCache();
  if (disk) {
    cachedProviders = disk.providers;
    cachedAt = disk.updatedAt;
  }
  if (!inflightRefresh) {
    inflightRefresh = scanProvidersNow().finally(() => {
      inflightRefresh = null;
    });
  }
}
