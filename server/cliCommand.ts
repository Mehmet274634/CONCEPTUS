import fs from 'node:fs';
import path from 'node:path';

/** Resolve npm's Windows wrapper to its actual program without invoking cmd.exe. */
export function cliCommand(executable: string, args: string[]) {
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(executable))
    return { executable, args, env: process.env };
  const wrapper = fs.readFileSync(executable, 'utf8');
  const match = wrapper.match(/"(?:%dp0%|%~dp0)[\\/]?([^"\r\n%]+\.(?:m?js|cjs|exe))"\s+%\*/i);
  if (!match) throw new Error('Desteklenmeyen Windows CLI başlatıcısı: ' + path.basename(executable));
  const entry = path.resolve(path.dirname(executable), match[1]);
  if (!fs.statSync(entry).isFile()) throw new Error('CLI giriş dosyası bulunamadı.');
  if (/\.exe$/i.test(entry)) return { executable: entry, args, env: process.env };
  return { executable: process.execPath, args: [entry, ...args], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } };
}
