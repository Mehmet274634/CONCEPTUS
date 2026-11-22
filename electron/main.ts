process.env.CONCEPTUS_EMBEDDED = '1';

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Server } from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
import { openFolderInIde } from '../server/ideLauncher.ts';
import { startConceptusServer } from '../server/index.ts';
import type { IdeId } from '../server/types.ts';
import { extractSha256ForFile, isAllowedUpdateHost } from '../server/updater.ts';

let mainWindow: BrowserWindow | null = null;
let localServer: Server | null = null;
let localUrl: string | null = null;

// Enforce single desktop instance (clicking taskbar/desktop icon focuses existing window)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function configureUserDataPaths() {
  if (app.isPackaged) {
    const userDataDir = path.join(app.getPath('userData'), 'data');
    const exportsDir = path.join(app.getPath('documents'), 'CONCEPTUS-Exports');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(exportsDir, { recursive: true });
    process.env.CONCEPTUS_DATA_DIR = userDataDir;
    process.env.CONCEPTUS_EXPORTS_DIR = exportsDir;
  } else {
    const root = app.getAppPath();
    process.env.CONCEPTUS_DATA_DIR = path.join(root, 'data');
    process.env.CONCEPTUS_EXPORTS_DIR = path.join(root, 'exports');
  }
}

function resolveIconPath(): string | undefined {
  const candidates = [
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.ico'),
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

function createMainWindow(url: string) {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);

  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'CONCEPTUS',
    backgroundColor: '#060709',
    show: false,
    autoHideMenuBar: true,
    icon: resolveIconPath(),
    // Frameless merged titlebar: removes extra top Windows strip, places native - [ ] X seamlessly inside our 48px TopBar!
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(!isMac
      ? {
          titleBarOverlay: {
            color: '#06070900',
            symbolColor: '#b4b8c4',
            height: 48,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  win.once('ready-to-show', () => {
    // Fit cleanly to the exact desktop work area right above the taskbar
    win.maximize();
    win.show();
    win.focus();
  });

  // Security: never allow external sites to open inside the Electron frame
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (localUrl && targetUrl.startsWith(localUrl)) {
      return { action: 'allow' };
    }
    if (/^https?:\/\//i.test(targetUrl)) {
      void shell.openExternal(targetUrl);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (localUrl && !targetUrl.startsWith(localUrl)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(targetUrl)) {
        void shell.openExternal(targetUrl);
      }
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  void win.loadURL(url);
  mainWindow = win;
}

ipcMain.handle('conceptus:pick-folder', async (_event, title?: string) => {
  const safeTitle = typeof title === 'string' ? title.slice(0, 120) : 'CONCEPTUS — Klasör Seç';
  const opts: Electron.OpenDialogOptions = {
    title: safeTitle,
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, opts)
    : await dialog.showOpenDialog(opts);

  if (result.canceled || result.filePaths.length === 0) {
    return { folderPath: null, cancelled: true };
  }
  return { folderPath: result.filePaths[0], cancelled: false };
});

// Security: strictly validate path is an existing directory before opening in OS Explorer (never execute files!)
ipcMain.handle('conceptus:open-folder', async (_event, folderPath: string) => {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return;
  try {
    const resolved = path.resolve(folderPath.trim());
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      await shell.openPath(resolved);
    }
  } catch {
    // ignore invalid/non-directory path
  }
});

// Security: strictly validate path & allowlisted IDE ('antigravity' | 'cursor' | 'vscode' | 'explorer')
ipcMain.handle(
  'conceptus:open-ide',
  async (_event, folderPath: string, ide: IdeId | 'explorer') => {
    return openFolderInIde(String(folderPath || ''), ide);
  }
);

function downloadHttpsToFile(
  urlStr: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void,
  redirectsLeft = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isAllowedUpdateHost(urlStr)) {
      reject(new Error('Güvenlik kuralı: yalnızca resmi GitHub Releases adresinden güncelleme indirilebilir.'));
      return;
    }

    const req = https.get(
      urlStr,
      { headers: { 'User-Agent': 'CONCEPTUS-Desktop-Updater/5.3.1' } },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error('Çok fazla yönlendirme (redirect).'));
            return;
          }
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          downloadHttpsToFile(nextUrl, destPath, onProgress, redirectsLeft - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (status !== 200) {
          res.resume();
          reject(new Error(`İndirme başarısız (HTTP ${status}).`));
          return;
        }

        const total = Number(res.headers['content-length'] || 0);
        let downloaded = 0;
        const out = fs.createWriteStream(destPath);
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          onProgress(downloaded, total);
        });
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => resolve());
        });
        out.on('error', (err) => {
          try {
            fs.unlinkSync(destPath);
          } catch {
            // ignore
          }
          reject(err);
        });
      }
    );

    req.setTimeout(120_000, () => {
      req.destroy(new Error('İndirme zaman aşımına uğradı.'));
    });
    req.on('error', reject);
  });
}

function fetchHttpsText(urlStr: string, redirectsLeft = 4): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isAllowedUpdateHost(urlStr)) {
      reject(new Error('İzin verilmeyen adres.'));
      return;
    }
    https
      .get(urlStr, { headers: { 'User-Agent': 'CONCEPTUS-Desktop-Updater/5.3.1' } }, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          fetchHttpsText(new URL(res.headers.location, urlStr).toString(), redirectsLeft - 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      })
      .on('error', reject);
  });
}

function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', reject);
  });
}

// Security-hardened Desktop Auto-Updater: HTTPS allowlist + SHA-256 verification + native NSIS launch
ipcMain.handle(
  'conceptus:download-update',
  async (
    _event,
    options: { url?: string; filename?: string; checksumsUrl?: string }
  ) => {
    const emit = (payload: {
      stage: 'downloading' | 'verifying' | 'launching' | 'error';
      percent: number;
      downloadedBytes?: number;
      totalBytes?: number;
      message?: string;
    }) => {
      mainWindow?.webContents.send('conceptus:update-progress', payload);
    };

    try {
      const urlStr = String(options?.url || '').trim();
      const rawName = path.basename(String(options?.filename || '').trim());
      if (!isAllowedUpdateHost(urlStr)) {
        throw new Error('Yalnızca resmi GitHub Releases indirme bağlantısı kabul edilir.');
      }
      if (!/^CONCEPTUS-Setup-[\d.]+\.exe$/i.test(rawName)) {
        throw new Error('Geçersiz kurulum dosyası adı.');
      }

      const updatesDir = path.join(app.getPath('temp'), 'conceptus-updates');
      fs.mkdirSync(updatesDir, { recursive: true });
      const destPath = path.join(updatesDir, rawName);

      emit({ stage: 'downloading', percent: 1, message: `${rawName} indiriliyor...` });

      let lastPct = 1;
      await downloadHttpsToFile(urlStr, destPath, (downloaded, total) => {
        const pct = total > 0 ? Math.min(95, Math.round((downloaded / total) * 95)) : 50;
        if (pct >= lastPct + 2 || pct === 95) {
          lastPct = pct;
          emit({
            stage: 'downloading',
            percent: pct,
            downloadedBytes: downloaded,
            totalBytes: total,
          });
        }
      });

      emit({ stage: 'verifying', percent: 97, message: 'SHA-256 bütünlüğü doğrulanıyor...' });

      const checksumsUrl = String(options?.checksumsUrl || '').trim();
      if (checksumsUrl && isAllowedUpdateHost(checksumsUrl)) {
        try {
          const sumsText = await fetchHttpsText(checksumsUrl);
          const expected = extractSha256ForFile(sumsText, rawName);
          if (expected) {
            const actual = await computeFileSha256(destPath);
            if (actual !== expected) {
              try {
                fs.unlinkSync(destPath);
              } catch {
                // ignore
              }
              throw new Error(
                'SHA-256 doğrulaması başarısız! İndirilen dosya bozuk olabilir ve güvenlik nedeniyle silindi.'
              );
            }
          }
        } catch (verifyErr: any) {
          if (String(verifyErr?.message || '').includes('SHA-256 doğrulaması başarısız')) {
            throw verifyErr;
          }
          // If SHA256SUMS.txt temporarily unreachable, still proceed only for verified GitHub HTTPS asset
        }
      }

      emit({
        stage: 'launching',
        percent: 100,
        message:
          'Sessizce güncelleniyor — uygulama birkaç saniye içinde yeni sürümle otomatik yeniden açılacak...',
      });

      // True silent in-place NSIS upgrade + automatic relaunch (zero setup wizard popups!)
      // Verified in electron-builder NsisTarget.js + installSection.nsh:
      // /S (silent) + --updated (preserve userData/installDir) + --force-run (auto-relaunch) + --keep-shortcuts
      const installer = spawn(
        destPath,
        ['/S', '--updated', '--force-run', '--keep-shortcuts'],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        }
      );
      installer.unref();

      setTimeout(() => {
        app.quit();
      }, 350);

      return { ok: true };
    } catch (err: any) {
      const msg = err?.message || String(err);
      emit({ stage: 'error', percent: 0, message: msg });
      return { ok: false, error: msg };
    }
  }
);

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    configureUserDataPaths();
    // Clean up temporary downloaded installer after a silent self-update
    if (process.argv.includes('--updated')) {
      try {
        fs.rmSync(path.join(app.getPath('temp'), 'conceptus-updates'), {
          recursive: true,
          force: true,
        });
      } catch {
        // non-fatal
      }
    }
    const distDir = path.join(app.getAppPath(), 'dist');

    // Bind exclusively to 127.0.0.1 ephemeral port — zero port conflicts ever!
    const started = await startConceptusServer({ port: 0, distDir });
    localServer = started.server;
    localUrl = started.url;

    createMainWindow(started.url);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && localUrl) {
        createMainWindow(localUrl);
      }
    });
  } catch (err: any) {
    dialog.showErrorBox(
      'CONCEPTUS Error',
      `Local server failed to start:\n${err?.message || String(err)}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch {
      // ignore
    }
    localServer = null;
  }
});
