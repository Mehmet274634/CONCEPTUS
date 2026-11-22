import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  SelfUpdateResult,
  UpdateAsset,
  UpdateCheckResult,
} from './types.ts';

const execFileAsync = promisify(execFile);

export const APP_VERSION = '5.3.2';
export const GITHUB_REPO = 'Mehmet274634/CONCEPTUS';
const RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASE_WEB_LATEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const CACHE_TTL_MS = 30 * 60 * 1000;

const ALLOWED_UPDATE_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

let cachedCheck: { at: number; result: UpdateCheckResult } | null = null;

export function normalizeSemver(version: string): [number, number, number] {
  const clean = (version || '').trim().replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.').map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = normalizeSemver(a);
  const pb = normalizeSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

export function isAllowedUpdateHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_UPDATE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function extractSha256ForFile(
  checksumsText: string,
  filename: string
): string | null {
  const target = filename.trim().toLowerCase();
  if (!target || !checksumsText) return null;
  for (const rawLine of checksumsText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    // Matches standard "HEXHASH  filename" or "HEXHASH *filename" or "filename HEXHASH"
    const m1 = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (m1) {
      const candidate = path.basename(m1[2].trim()).toLowerCase();
      if (candidate === target) return m1[1].toLowerCase();
    }
    const m2 = line.match(/^(\S+)\s+([a-fA-F0-9]{64})$/);
    if (m2) {
      const candidate = path.basename(m2[1].trim()).toLowerCase();
      if (candidate === target) return m2[2].toLowerCase();
    }
  }
  return null;
}

function getRuntimeFlags() {
  const isDesktop = process.env.CONCEPTUS_EMBEDDED === '1';
  const cwd = process.cwd();
  const isGitRepo = !isDesktop && fs.existsSync(path.join(cwd, '.git'));
  return { isDesktop, isGitRepo };
}

export function parseGitHubReleasePayload(
  payload: any,
  currentVersion = APP_VERSION
): UpdateCheckResult {
  const { isDesktop, isGitRepo } = getRuntimeFlags();
  const rawTag = String(payload?.tag_name || payload?.name || '').trim();
  const latestVersion = rawTag.replace(/^v/i, '') || currentVersion;
  const updateAvailable = compareSemver(currentVersion, latestVersion) < 0;

  const assets: any[] = Array.isArray(payload?.assets) ? payload.assets : [];
  const toAsset = (a: any): UpdateAsset | undefined => {
    const url = String(a?.browser_download_url || '').trim();
    if (!url || !isAllowedUpdateHost(url)) return undefined;
    return {
      name: String(a.name || ''),
      url,
      sizeBytes: Number(a.size || 0),
    };
  };

  const setupRaw = assets.find((a) =>
    /CONCEPTUS-Setup-.*\.exe$/i.test(String(a?.name || ''))
  );
  const portableRaw = assets.find((a) =>
    /CONCEPTUS-.*Portable\.exe$/i.test(String(a?.name || ''))
  );
  const macRaw = assets.find((a) => /\.dmg$/i.test(String(a?.name || '')));
  const linuxRaw = assets.find((a) => /\.AppImage$/i.test(String(a?.name || '')));
  const sumsRaw = assets.find((a) =>
    /^SHA256SUMS\.txt$/i.test(String(a?.name || ''))
  );

  const releaseUrl =
    typeof payload?.html_url === 'string' && isAllowedUpdateHost(payload.html_url)
      ? payload.html_url
      : `https://github.com/${GITHUB_REPO}/releases`;

  return {
    status: updateAvailable ? 'update_available' : 'up_to_date',
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseName: String(payload?.name || `CONCEPTUS v${latestVersion}`).trim(),
    releaseUrl,
    publishedAt: typeof payload?.published_at === 'string' ? payload.published_at : undefined,
    releaseNotes: String(payload?.body || '').trim().slice(0, 6000),
    setupAsset: setupRaw ? toAsset(setupRaw) : undefined,
    portableAsset: portableRaw ? toAsset(portableRaw) : undefined,
    macAsset: macRaw ? toAsset(macRaw) : undefined,
    linuxAsset: linuxRaw ? toAsset(linuxRaw) : undefined,
    checksumsUrl: sumsRaw ? toAsset(sumsRaw)?.url : undefined,
    isDesktop,
    isGitRepo,
    checkedAt: Date.now(),
  };
}

export function buildReleaseFromTag(
  rawTag: string,
  currentVersion = APP_VERSION
): UpdateCheckResult {
  const { isDesktop, isGitRepo } = getRuntimeFlags();
  const cleanTag = rawTag.trim().replace(/^v/i, '');
  const latestVersion = cleanTag || currentVersion;
  const tag = `v${latestVersion}`;
  const updateAvailable = compareSemver(currentVersion, latestVersion) < 0;
  const dlBase = `https://github.com/${GITHUB_REPO}/releases/download/${tag}`;

  return {
    status: updateAvailable ? 'update_available' : 'up_to_date',
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseName: `CONCEPTUS ${tag}`,
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
    releaseNotes: updateAvailable
      ? `Yeni kararlı sürüm **CONCEPTUS ${tag}** GitHub Releases üzerinde yayında (SHA-256 doğrulamalı sessiz kurulum).`
      : '',
    setupAsset: {
      name: `CONCEPTUS-Setup-${latestVersion}.exe`,
      url: `${dlBase}/CONCEPTUS-Setup-${latestVersion}.exe`,
      sizeBytes: 0,
    },
    portableAsset: {
      name: `CONCEPTUS-${latestVersion}-Portable.exe`,
      url: `${dlBase}/CONCEPTUS-${latestVersion}-Portable.exe`,
      sizeBytes: 0,
    },
    macAsset: {
      name: `CONCEPTUS-${latestVersion}.dmg`,
      url: `${dlBase}/CONCEPTUS-${latestVersion}.dmg`,
      sizeBytes: 0,
    },
    linuxAsset: {
      name: `CONCEPTUS-${latestVersion}.AppImage`,
      url: `${dlBase}/CONCEPTUS-${latestVersion}.AppImage`,
      sizeBytes: 0,
    },
    checksumsUrl: `${dlBase}/SHA256SUMS.txt`,
    isDesktop,
    isGitRepo,
    checkedAt: Date.now(),
  };
}

/**
 * Zero-rate-limit fallback: resolves the latest release tag directly from
 * github.com/.../releases/latest HTTP 302 Location header (never hits the 60 req/hr api.github.com limit!).
 */
async function checkLatestViaWebRedirect(
  signal: AbortSignal
): Promise<UpdateCheckResult | null> {
  try {
    const res = await fetch(RELEASE_WEB_LATEST_URL, {
      redirect: 'manual',
      headers: {
        'User-Agent': `CONCEPTUS/${APP_VERSION}`,
      },
      signal,
    });
    const loc = res.headers.get('location') || '';
    const match = loc.match(/\/releases\/tag\/(v?[\d.]+(?:-[a-zA-Z0-9.]+)?)/i);
    if (match && match[1]) {
      return buildReleaseFromTag(match[1], APP_VERSION);
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkForUpdates(force = false): Promise<UpdateCheckResult> {
  if (!force && cachedCheck && Date.now() - cachedCheck.at < CACHE_TTL_MS) {
    return cachedCheck.result;
  }

  const { isDesktop, isGitRepo } = getRuntimeFlags();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `CONCEPTUS/${APP_VERSION}`,
      },
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json();
      const parsed = parseGitHubReleasePayload(data, APP_VERSION);
      cachedCheck = { at: Date.now(), result: parsed };
      return parsed;
    }

    // If GitHub API returns 403/429 (hourly IP rate limit) or any non-200,
    // immediately fall back to zero-rate-limit github.com/releases/latest 302 redirect!
    const fallbackResult = await checkLatestViaWebRedirect(controller.signal);
    if (fallbackResult) {
      cachedCheck = { at: Date.now(), result: fallbackResult };
      return fallbackResult;
    }

    return {
      status: 'offline',
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      updateAvailable: false,
      releaseName: `CONCEPTUS v${APP_VERSION}`,
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
      releaseNotes: '',
      isDesktop,
      isGitRepo,
      checkedAt: Date.now(),
      error: `GitHub API yanıtı: HTTP ${res.status}`,
    };
  } catch (err: any) {
    // Also attempt redirect fallback if API host failed while github.com is reachable
    if (err?.name !== 'AbortError') {
      const fallbackResult = await checkLatestViaWebRedirect(controller.signal);
      if (fallbackResult) {
        cachedCheck = { at: Date.now(), result: fallbackResult };
        return fallbackResult;
      }
    }
    return {
      status: 'offline',
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      updateAvailable: false,
      releaseName: `CONCEPTUS v${APP_VERSION}`,
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
      releaseNotes: '',
      isDesktop,
      isGitRepo,
      checkedAt: Date.now(),
      error:
        err?.name === 'AbortError'
          ? 'Güncelleme sunucusu zaman aşımına uğradı.'
          : 'İnternet bağlantısı yok veya GitHub Releases erişilemedi.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Safe 1-click self-updater for local Web / CLI users running from a clean Git clone.
 * Refuses to overwrite uncommitted local changes.
 */
export async function runLocalGitSelfUpdate(): Promise<SelfUpdateResult> {
  const { isDesktop, isGitRepo } = getRuntimeFlags();
  if (isDesktop) {
    return {
      ok: false,
      restartRequired: false,
      message: 'Masaüstü uygulamasında güncelleme Windows Setup kurulumuyla yapılır.',
    };
  }
  if (!isGitRepo) {
    return {
      ok: false,
      restartRequired: false,
      message:
        'Bu kurulum bir Git deposundan çalışmıyor. En yeni sürümü GitHub Releases üzerinden indirebilirsin.',
    };
  }

  const cwd = process.cwd();
  const logs: string[] = [];

  try {
    const status = await execFileAsync('git', ['status', '--porcelain'], {
      cwd,
      timeout: 15_000,
    });
    if (status.stdout.trim().length > 0) {
      return {
        ok: false,
        restartRequired: false,
        message:
          'Çalışma klasöründe kaydedilmemiş yerel değişiklikler var; veri kaybını önlemek için otomatik git pull durduruldu. Önce değişikliklerini commit/stash edip tekrar dene.',
        log: status.stdout.trim(),
      };
    }

    const beforeHead = (
      await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd, timeout: 10_000 })
    ).stdout.trim();

    const pull = await execFileAsync('git', ['pull', '--ff-only', 'origin', 'main'], {
      cwd,
      timeout: 60_000,
    });
    logs.push(`$ git pull --ff-only origin main\n${(pull.stdout || pull.stderr).trim()}`);

    const afterHead = (
      await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd, timeout: 10_000 })
    ).stdout.trim();

    if (beforeHead === afterHead) {
      return {
        ok: true,
        restartRequired: false,
        message: 'Yerel web uygulaman zaten en güncel sürümde.',
        log: logs.join('\n\n'),
      };
    }

    const diffFiles = (
      await execFileAsync('git', ['diff', '--name-only', `${beforeHead}..${afterHead}`], {
        cwd,
        timeout: 10_000,
      })
    ).stdout;

    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    if (/package(-lock)?\.json/i.test(diffFiles)) {
      const inst = await execFileAsync(npmBin, ['install', '--no-audit', '--no-fund'], {
        cwd,
        timeout: 180_000,
      });
      logs.push(`$ npm install\n${(inst.stdout || '').slice(-800).trim()}`);
    }

    const build = await execFileAsync(npmBin, ['run', 'build'], {
      cwd,
      timeout: 120_000,
    });
    logs.push(`$ npm run build\n${(build.stdout || '').slice(-800).trim()}`);

    cachedCheck = null;

    let newVersion = APP_VERSION;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      if (pkg?.version) newVersion = String(pkg.version);
    } catch {
      // ignore
    }

    return {
      ok: true,
      updatedTo: newVersion,
      restartRequired: true,
      message: `CONCEPTUS v${newVersion} (${afterHead}) başarıyla çekildi ve derlendi. Yeni sürümü etkinleştirmek için sunucuyu yeniden başlat.`,
      log: logs.join('\n\n'),
    };
  } catch (err: any) {
    return {
      ok: false,
      restartRequired: false,
      message: `Otomatik güncelleme tamamlanamadı: ${err?.message || String(err)}`,
      log: logs.join('\n\n'),
    };
  }
}
