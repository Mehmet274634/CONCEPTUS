import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopUpdateProgress {
  stage: 'downloading' | 'verifying' | 'launching' | 'error';
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
  message?: string;
}

export interface ConceptusDesktopBridge {
  isDesktop: true;
  platform: string;
  version: string;
  pickFolder: (title?: string) => Promise<{ folderPath: string | null; cancelled: boolean }>;
  openFolderInExplorer: (folderPath: string) => Promise<void>;
  downloadAndInstallUpdate: (options: {
    url: string;
    filename: string;
    checksumsUrl?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onUpdateProgress: (cb: (progress: DesktopUpdateProgress) => void) => () => void;
}

const bridge: ConceptusDesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  version: '5.0.0',
  pickFolder: (title?: string) => ipcRenderer.invoke('conceptus:pick-folder', title),
  openFolderInExplorer: (folderPath: string) =>
    ipcRenderer.invoke('conceptus:open-folder', folderPath),
  downloadAndInstallUpdate: (options) =>
    ipcRenderer.invoke('conceptus:download-update', options),
  onUpdateProgress: (cb) => {
    const handler = (_event: unknown, payload: DesktopUpdateProgress) => cb(payload);
    ipcRenderer.on('conceptus:update-progress', handler);
    return () => ipcRenderer.removeListener('conceptus:update-progress', handler);
  },
};

contextBridge.exposeInMainWorld('conceptusDesktop', bridge);
