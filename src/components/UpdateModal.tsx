import { useEffect, useState } from 'react';
import {
  ArrowUpCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  GitPullRequest,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react';
import {
  downloadAndInstallDesktopUpdate,
  isDesktopApp,
  runWebSelfUpdate,
  subscribeDesktopUpdateProgress,
} from '../api.ts';
import { useI18n } from '../i18n.tsx';
import type {
  DesktopUpdateProgress,
  SelfUpdateResult,
  UpdateCheckResult,
} from '../types.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  updateInfo: UpdateCheckResult | null;
  checking: boolean;
  autoCheckEnabled: boolean;
  onToggleAutoCheck: (next: boolean) => void;
  onCheckNow: () => Promise<void>;
}

function formatMB(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateModal({
  open,
  onClose,
  updateInfo,
  checking,
  autoCheckEnabled,
  onToggleAutoCheck,
  onCheckNow,
}: UpdateModalProps) {
  const { t, lang } = useI18n();
  const desktop = isDesktopApp();
  const [desktopProgress, setDesktopProgress] = useState<DesktopUpdateProgress | null>(null);
  const [desktopRunning, setDesktopRunning] = useState(false);
  const [webUpdating, setWebUpdating] = useState(false);
  const [webResult, setWebResult] = useState<SelfUpdateResult | null>(null);

  useEffect(() => {
    if (!desktop) return;
    return subscribeDesktopUpdateProgress((prog) => {
      setDesktopProgress(prog);
      if (prog.stage === 'error') {
        setDesktopRunning(false);
      }
    });
  }, [desktop]);

  if (!open) return null;

  const currentVersion = updateInfo?.currentVersion || '5.3.3';
  const latestVersion = updateInfo?.latestVersion || currentVersion;
  const available = Boolean(updateInfo?.updateAvailable);
  const offline = updateInfo?.status === 'offline';

  const handleDesktopInstall = async () => {
    if (!updateInfo?.setupAsset) return;
    setDesktopRunning(true);
    setDesktopProgress({
      stage: 'downloading',
      percent: 1,
      message: t('Güncelleme başlatılıyor...', 'Starting update...'),
    });
    const res = await downloadAndInstallDesktopUpdate({
      url: updateInfo.setupAsset.url,
      filename: updateInfo.setupAsset.name,
      checksumsUrl: updateInfo.checksumsUrl,
    });
    if (!res.ok) {
      setDesktopRunning(false);
      setDesktopProgress({
        stage: 'error',
        percent: 0,
        message: res.error || t('Güncelleme indirilemedi.', 'Update download failed.'),
      });
    }
  };

  const handleWebSelfUpdate = async () => {
    setWebUpdating(true);
    setWebResult(null);
    try {
      const res = await runWebSelfUpdate();
      setWebResult(res);
    } catch (err: any) {
      setWebResult({
        ok: false,
        restartRequired: false,
        message: err?.message || t('Güncelleme hatası.', 'Update error.'),
      });
    } finally {
      setWebUpdating(false);
    }
  };

  const formattedDate = updateInfo?.publishedAt
    ? new Date(updateInfo.publishedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl border border-white/[0.12] bg-[#0b0c10] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                available
                  ? 'bg-[#3fd0c9]/15 border-[#3fd0c9]/40 text-[#88ece7]'
                  : 'bg-white/[0.05] border-white/[0.1] text-zinc-300'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {t('CONCEPTUS Güncelleme Merkezi', 'CONCEPTUS Update Center')}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {desktop
                  ? t('Masaüstü Stüdyosu · SHA-256 Doğrulamalı', 'Desktop Studio · SHA-256 Verified')
                  : t('Yerel Web Stüdyosu · GitHub Releases Senkronu', 'Local Web Studio · GitHub Releases Sync')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Status Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {offline ? (
                <WifiOff className="w-5 h-5 text-zinc-400 shrink-0" />
              ) : available ? (
                <ArrowUpCircle className="w-5 h-5 text-[#4cc58a] shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-[#4cc58a] shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white">
                    {offline
                      ? t('Çevrimdışı / Erişilemedi', 'Offline / Unreachable')
                      : available
                        ? t(`Yeni sürüm hazır: v${latestVersion}`, `New release available: v${latestVersion}`)
                        : t(`En güncel sürümü kullanıyorsun`, `You're up to date`)}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
                    v{currentVersion}
                    {available ? ` → v${latestVersion}` : ''}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {offline
                    ? updateInfo?.error
                    : formattedDate
                      ? `${updateInfo?.releaseName || `v${latestVersion}`} · ${formattedDate}`
                      : t('GitHub Releases ile doğrulandı · Sıfır telemetri.', 'Verified via GitHub Releases · Zero telemetry.')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void onCheckNow()}
              disabled={checking || desktopRunning || webUpdating}
              className="glass-pill inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full text-zinc-200 hover:text-white cursor-pointer disabled:opacity-40"
            >
              {checking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {checking ? t('Denetleniyor...', 'Checking...') : t('Şimdi Denetle', 'Check Now')}
            </button>
          </div>

          {/* Desktop Progress Bar */}
          {desktopProgress && (
            <div
              className={`rounded-2xl p-3.5 border text-xs space-y-2 ${
                desktopProgress.stage === 'error'
                  ? 'bg-[#ff7a6e]/10 border-[#ff7a6e]/35 text-[#ffb4ad]'
                  : 'bg-[#3fd0c9]/10 border-[#3fd0c9]/35 text-[#c7faf6]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium flex items-center gap-1.5">
                  {desktopProgress.stage === 'verifying' && (
                    <ShieldCheck className="w-3.5 h-3.5 text-[#4cc58a]" />
                  )}
                  {desktopProgress.message ||
                    (desktopProgress.stage === 'downloading'
                      ? t('İndiriliyor...', 'Downloading...')
                      : t('İşleniyor...', 'Processing...'))}
                </span>
                <span className="font-mono text-[11px]">
                  {desktopProgress.downloadedBytes && desktopProgress.totalBytes
                    ? `${formatMB(desktopProgress.downloadedBytes)} / ${formatMB(desktopProgress.totalBytes)}`
                    : `${desktopProgress.percent}%`}
                </span>
              </div>
              {desktopProgress.stage !== 'error' && (
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#7c74ff] to-[#3fd0c9] transition-all duration-200"
                    style={{ width: `${Math.max(4, desktopProgress.percent)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Web Self-Update Result */}
          {webResult && (
            <div
              className={`rounded-2xl p-3.5 border text-xs space-y-2 ${
                webResult.ok
                  ? 'bg-[#4cc58a]/10 border-[#4cc58a]/35 text-[#a5ecc7]'
                  : 'bg-[#f0b44c]/10 border-[#f0b44c]/35 text-[#fde3a7]'
              }`}
            >
              <p className="font-medium">{webResult.message}</p>
              {webResult.log && (
                <pre className="rounded-xl bg-black/50 p-2.5 text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-36">
                  {webResult.log}
                </pre>
              )}
            </div>
          )}

          {/* Release Notes */}
          {updateInfo?.releaseNotes && (
            <div className="rounded-2xl border border-white/[0.07] bg-black/35 p-4 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                {t(`Sürüm Notları (v${latestVersion})`, `Release Notes (v${latestVersion})`)}
              </div>
              <div className="text-xs max-h-52 overflow-y-auto pr-1">
                <MarkdownView content={updateInfo.releaseNotes} />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between flex-wrap gap-2.5 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoCheckEnabled}
                onChange={(e) => onToggleAutoCheck(e.target.checked)}
                className="accent-[#7c74ff] rounded cursor-pointer"
              />
              {t('Açılışta otomatik denetle', 'Auto-check on startup')}
            </label>

            <div className="flex items-center gap-2 flex-wrap">
              {updateInfo?.releaseUrl && (
                <a
                  href={updateInfo.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-pill inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full text-zinc-200 hover:text-white"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  GitHub
                </a>
              )}

              {/* Desktop 1-Click Verified Update */}
              {desktop && available && updateInfo?.setupAsset && (
                <button
                  type="button"
                  onClick={() => void handleDesktopInstall()}
                  disabled={desktopRunning}
                  className="btn-white inline-flex items-center gap-1.5 text-xs px-4 py-2 cursor-pointer disabled:opacity-40"
                >
                  {desktopRunning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {t(
                    `İndir & Güncelle (${formatMB(updateInfo.setupAsset.sizeBytes) || '.exe'})`,
                    `Download & Update (${formatMB(updateInfo.setupAsset.sizeBytes) || '.exe'})`
                  )}
                </button>
              )}

              {/* Web / Local Git Repo 1-Click Self-Update */}
              {!desktop && updateInfo?.isGitRepo && (
                <button
                  type="button"
                  onClick={() => void handleWebSelfUpdate()}
                  disabled={webUpdating}
                  className="btn-white inline-flex items-center gap-1.5 text-xs px-4 py-2 cursor-pointer disabled:opacity-40"
                >
                  {webUpdating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GitPullRequest className="w-3.5 h-3.5" />
                  )}
                  {webUpdating
                    ? t('Güncelleniyor...', 'Updating...')
                    : t('Web Uygulamasını Güncelle', 'Auto-Update Web App')}
                </button>
              )}

              {/* Direct .exe download fallback for non-git web mode */}
              {!desktop && !updateInfo?.isGitRepo && updateInfo?.setupAsset && (
                <a
                  href={updateInfo.setupAsset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-white inline-flex items-center gap-1.5 text-xs px-4 py-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t(`Setup v${latestVersion} İndir`, `Download Setup v${latestVersion}`)}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
