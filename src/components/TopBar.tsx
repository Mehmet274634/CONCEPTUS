import {
  ArrowUpCircle,
  FileCode2,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from 'lucide-react';
import { isDesktopApp } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import {
  DOMAIN_OPTIONS,
  type DebateSession,
  type UiMode,
  type UpdateCheckResult,
} from '../types.ts';

export type StageTab = 'debate' | 'synthesis' | 'blueprint';

interface TopBarProps {
  activeSession: DebateSession | null;
  activeStage: StageTab;
  onSelectStage: (stage: StageTab) => void;
  uiMode: UiMode;
  onUiModeChange: (mode: UiMode) => void;
  leftOpen: boolean;
  onToggleLeft: () => void;
  rightOpen: boolean;
  onToggleRight: () => void;
  installedCount: number;
  totalProviders: number;
  updateInfo: UpdateCheckResult | null;
  onOpenUpdateModal: () => void;
}

const DOMAIN_SHORT_EN: Record<string, string> = {
  app_product: 'PRODUCT',
  tech_project: 'TECH',
  problem_solving: 'PROBLEM',
  strategy_general: 'STRATEGY',
};

export function TopBar({
  activeSession,
  activeStage,
  onSelectStage,
  uiMode,
  onUiModeChange,
  leftOpen,
  onToggleLeft,
  rightOpen,
  onToggleRight,
  installedCount,
  totalProviders,
  updateInfo,
  onOpenUpdateModal,
}: TopBarProps) {
  const { lang, setLang, t } = useI18n();
  const desktopWin =
    isDesktopApp() &&
    typeof window !== 'undefined' &&
    window.conceptusDesktop?.platform !== 'darwin';

  const hasRounds = Boolean(activeSession && activeSession.rounds.length > 0);
  const hasDebate = Boolean(activeSession && activeSession.rounds.length >= 2);
  const hasMaster = Boolean(activeSession?.synthesis?.content);
  const blueprintCount =
    activeSession?.blueprint?.files.filter((f) => f.status === 'done').length || 0;

  const domainShort = activeSession
    ? lang === 'en'
      ? DOMAIN_SHORT_EN[activeSession.domain] || activeSession.domain
      : DOMAIN_OPTIONS.find((d) => d.id === activeSession.domain)?.short ||
        activeSession.domain
    : null;

  return (
    <header
      className={`desktop-drag h-12 pl-4 ${
        desktopWin ? 'pr-[144px]' : 'pr-4'
      } border-b border-white/[0.06] flex items-center justify-between gap-3 shrink-0 z-20 select-none`}
    >
      {/* Left: Reopen Left Rail button + Clean Breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0">
        {!leftOpen && (
          <button
            onClick={onToggleLeft}
            title={t('Oturumlar panelini aç', 'Show sessions sidebar')}
            className="desktop-no-drag p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {activeSession ? (
          <div className="flex items-center gap-2 text-xs min-w-0">
            <span className="font-semibold tracking-wider uppercase text-zinc-400 shrink-0">
              {domainShort}
            </span>
            <span className="text-zinc-600">/</span>
            <span className="font-medium text-zinc-200 truncate">
              {activeSession.title}
            </span>
          </div>
        ) : (
          <span className="text-xs font-medium text-zinc-500">
            {t('Yeni Fikir Stüdyosu', 'New Idea Studio')}
          </span>
        )}
      </div>

      {/* Center: Clean 3-Stage Studio Pills when in a Session */}
      {activeSession && (
        <nav className="desktop-no-drag hidden md:flex items-center gap-1 p-1 rounded-full bg-white/[0.03] border border-white/[0.07]">
          <button
            onClick={() => onSelectStage('debate')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeStage === 'debate'
                ? 'bg-white/[0.12] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasDebate
                  ? 'bg-[#4cc58a]'
                  : hasRounds
                    ? 'bg-[#7c74ff]'
                    : 'bg-zinc-600'
              }`}
            />
            {t('1. Fikir & Tartışma', '1. Idea & Debate')}
            <span className="text-[10px] font-mono text-zinc-400">
              ({activeSession.rounds.length})
            </span>
          </button>

          <button
            onClick={() => onSelectStage('synthesis')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeStage === 'synthesis'
                ? 'bg-white/[0.12] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles
              className={`w-3 h-3 ${
                hasMaster ? 'text-[#3fd0c9]' : 'text-zinc-500'
              }`}
            />
            {t('2. Master Karar', '2. Master Decision')}
          </button>

          <button
            onClick={() => onSelectStage('blueprint')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeStage === 'blueprint'
                ? 'bg-white/[0.12] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode2
              className={`w-3 h-3 ${
                blueprintCount > 0 ? 'text-[#958fff]' : 'text-zinc-500'
              }`}
            />
            {t('3. MD Paketi', '3. MD Blueprints')}
            {blueprintCount > 0 && (
              <span className="text-[10px] font-mono text-[#958fff]">
                {blueprintCount}
              </span>
            )}
          </button>
        </nav>
      )}

      {/* Right: Update Pill + TR/EN + Simple/Pro + Right Tools Toggle */}
      <div className="desktop-no-drag flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenUpdateModal}
          title={
            updateInfo?.updateAvailable
              ? t(
                  `Yeni sürüm mevcut: v${updateInfo.latestVersion} — Güncellemek için tıkla`,
                  `New release available: v${updateInfo.latestVersion} — Click to update`
                )
              : t('Sürüm & Otomatik Güncelleme Merkezi', 'Version & Auto-Update Center')
          }
          className={`inline-flex items-center gap-1.5 text-[10.5px] font-mono px-2.5 py-1 rounded-full border transition cursor-pointer ${
            updateInfo?.updateAvailable
              ? 'bg-[#3fd0c9]/15 text-[#88ece7] border-[#3fd0c9]/45 hover:bg-[#3fd0c9]/25'
              : 'bg-white/[0.03] text-zinc-400 border-white/[0.08] hover:text-zinc-200 hover:bg-white/[0.06]'
          }`}
        >
          {updateInfo?.updateAvailable && (
            <ArrowUpCircle className="w-3 h-3 text-[#4cc58a]" />
          )}
          <span>
            {updateInfo?.updateAvailable
              ? `v${updateInfo.latestVersion}`
              : `v${updateInfo?.currentVersion || '5.1.2'}`}
          </span>
        </button>

        {/* TR | EN Language Switch */}
        <div
          className="flex items-center p-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]"
          title={t(
            'Arayüz ve yapay zekâ çıktı dili (Türkçe / English)',
            'Interface & AI output language (Türkçe / English)'
          )}
        >
          <button
            type="button"
            onClick={() => setLang('tr')}
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold transition cursor-pointer ${
              lang === 'tr'
                ? 'bg-white/[0.14] text-white'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            TR
          </button>
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold transition cursor-pointer ${
              lang === 'en'
                ? 'bg-white/[0.14] text-white'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            EN
          </button>
        </div>

        {/* Simple / Pro Mode Switch */}
        <div
          className="flex items-center p-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]"
          title={t(
            'Sade: Teknik ayarları gizler, akıllı hazır profillerle tek tıkla çalışır · Pro: Tüm model, rol ve ince ayarları açar',
            'Simple: Hides advanced settings with 1-click smart profiles · Pro: Full control over models, roles & effort'
          )}
        >
          <button
            type="button"
            onClick={() => onUiModeChange('simple')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer ${
              uiMode === 'simple'
                ? 'bg-[#f7f8f8] text-[#060709] font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('Sade', 'Simple')}
          </button>
          <button
            type="button"
            onClick={() => onUiModeChange('pro')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer ${
              uiMode === 'pro'
                ? 'bg-[#f7f8f8] text-[#060709] font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Pro
          </button>
        </div>

        {!rightOpen && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4cc58a]" />
            {installedCount}/{totalProviders} CLI
          </span>
        )}
        <button
          onClick={onToggleRight}
          title={
            rightOpen
              ? t('Bağlı araçlar kutusunu gizle', 'Hide tools sidebar')
              : t('Bağlı araçlar kutusunu aç', 'Show tools sidebar')
          }
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition cursor-pointer hidden lg:inline-flex"
        >
          {rightOpen ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
}
