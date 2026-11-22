import { contextBridge, ipcRenderer } from 'electron';

export interface ConceptusDesktopBridge {
  isDesktop: true;
  platform: string;
  version: string;
  pickFolder: (title?: string) => Promise<{ folderPath: string | null; cancelled: boolean }>;
  openFolderInExplorer: (folderPath: string) => Promise<void>;
}

const bridge: ConceptusDesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  version: '5.0.0',
  pickFolder: (title?: string) => ipcRenderer.invoke('conceptus:pick-folder', title),
  openFolderInExplorer: (folderPath: string) =>
    ipcRenderer.invoke('conceptus:open-folder', folderPath),
};

contextBridge.exposeInMainWorld('conceptusDesktop', bridge);
