process.env.CONCEPTUS_EMBEDDED = '1';

import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
import { startConceptusServer } from '../server/index.ts';

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

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    configureUserDataPaths();
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
