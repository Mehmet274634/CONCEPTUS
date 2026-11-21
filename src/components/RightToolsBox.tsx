import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  FileCode2,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Users,
} from 'lucide-react';
import { useI18n } from '../i18n.tsx';
import {
  getQuotaPoolKey,
  PROVIDER_META,
  type DebateSession,
  type FallbackMode,
  type FallbackPolicy,
  type PoolCooldown,
  type ProviderId,
  type ProviderInfo,
  type SeatConfig,
} from '../types.ts';
import type { StageTab } from './TopBar.tsx';

interface RightToolsBoxProps {
  providers: ProviderInfo[];
  cooldowns: PoolCooldown[];
  fallbackPolicy: FallbackPolicy;
  onUpdateFallbackPolicy: (patch: Partial<FallbackPolicy>) => Promise<void>;
  onResetCooldowns: () => Promise<void>;
  loadingProviders: boolean;
  onRefreshProviders: () => void;
  activeSession: DebateSession | null;
  draftSeats: SeatConfig[];
  onSelectStage: (stage: StageTab) => void;
}

const FALLBACK_MODES: { id: FallbackMode; label: string }[] = [
  { id: 'quality_auto', label: 'Kalite' },
  { id: 'custom', label: 'Özel' },
  { id: 'ask', label: 'Sor' },
];

export function RightToolsBox({
  providers,
  cooldowns,
  fallbackPolicy,
  onUpdateFallbackPolicy,
  onResetCooldowns,
  loadingProviders,
  onRefreshProviders,
  activeSession,
  draftSeats,
  onSelectStage,
}: RightToolsBoxProps) {
  const { t } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [resettingQuota, setResettingQuota] = useState(false);

  const currentSeats = activeSession ? activeSession.seats : draftSeats;
  const activeSeatCount = currentSeats.filter((s) => s.enabled).length;
  const blueprintCount =
    activeSession?.blueprint?.files.filter((f) => f.status === 'done').length || 0;
  const installedProviders = providers.filter((p) => p.installed);
  const installedCount = installedProviders.length;

  const exhaustedPools = new Set(cooldowns.map((c) => c.pool));

  const selectedCustomProvider: ProviderId =
    fallbackPolicy.customProvider ||
    (installedProviders.find((p) => p.id === 'codex')?.id ||
      installedProviders[0]?.id ||
      'antigravity');
  const customProviderInfo = providers.find((p) => p.id === selectedCustomProvider);
  const selectedCustomModel =
    fallbackPolicy.customModel ||
    customProviderInfo?.models[1]?.id ||
    customProviderInfo?.models[0]?.id ||
    'auto';

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1600);
  };

  const handleModeClick = (mode: FallbackMode) => {
    if (mode === 'custom' && (!fallbackPolicy.customProvider || !fallbackPolicy.customModel)) {
      const defProv =
        installedProviders.find((p) => p.id === 'codex') || installedProviders[0];
      const defModel = defProv?.models[1]?.id || defProv?.models[0]?.id || 'auto';
      void onUpdateFallbackPolicy({
        mode,
        customProvider: defProv?.id || 'antigravity',
        customModel: defModel,
      });
    } else {
      void onUpdateFallbackPolicy({ mode });
    }
  };

  return (
    <aside className="w-[244px] shrink-0 pt-3 pr-3 pb-3 hidden lg:flex flex-col gap-3 select-none overflow-y-auto">
      {/* 1. Connected CLI Tools Card */}
      <div className="glass-panel rounded-2xl overflow-hidden shrink-0">
        <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-zinc-400 tracking-wide">
              {t('Bağlı Araçlar', 'Connected CLIs')}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] text-zinc-300">
              {installedCount}/{providers.length}
            </span>
          </div>
          <button
            onClick={onRefreshProviders}
            disabled={loadingProviders}
            title={t('Araçları yeniden tara', 'Rescan installed CLIs')}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition cursor-pointer disabled:opacity-40"
          >
            <RefreshCw
              className={`w-3 h-3 ${loadingProviders ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        <div className="p-1.5 space-y-0.5">
          {providers.map((p) => {
            const meta = PROVIDER_META[p.id];
            const isExpanded = expandedId === p.id;
            const hasExhausted = cooldowns.some((c) => c.pool.startsWith(`${p.id}:`));
            return (
              <div key={p.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl hover:bg-white/[0.05] transition text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        p.installed
                          ? `${meta.dot} shadow-[0_0_8px_currentColor]`
                          : 'bg-zinc-700'
                      }`}
                    />
                    <span
                      className={`text-[12px] font-medium truncate ${
                        p.installed ? 'text-zinc-200' : 'text-zinc-500'
                      }`}
                    >
                      {p.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasExhausted && (
                      <span
                        title="Bu araçta kotası dolan model havuzu var"
                        className="w-1.5 h-1.5 rounded-full bg-[#f0b44c]"
                      />
                    )}
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                        p.installed
                          ? 'bg-white/[0.06] text-zinc-300'
                          : 'bg-white/[0.03] text-zinc-600'
                      }`}
                    >
                      {p.installed ? p.models.length : 'yok'}
                    </span>
                    <ChevronRight
                      className={`w-3 h-3 text-zinc-600 transition-transform ${
                        isExpanded ? 'rotate-90 text-zinc-300' : ''
                      }`}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="mx-2 mb-1.5 px-2.5 py-2 rounded-xl bg-black/35 border border-white/[0.06] space-y-1.5 text-[10px]">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Terminal className="w-3 h-3 text-zinc-500" />
                        {p.command}
                      </span>
                      <span className="font-mono text-zinc-500 truncate max-w-[115px]">
                        {p.version || (p.installed ? 'aktif' : 'kurulu değil')}
                      </span>
                    </div>
                    {p.note && (
                      <p className="text-zinc-500 leading-relaxed">{p.note}</p>
                    )}
                    {!p.installed && p.installHint && (
                      <div className="flex items-center justify-between gap-1.5 bg-white/[0.04] rounded-lg px-2 py-1 border border-white/[0.06]">
                        <code className="text-[9.5px] text-zinc-300 truncate">
                          {p.installHint}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyCommand(p.installHint!)}
                          className="text-zinc-400 hover:text-white shrink-0 cursor-pointer"
                        >
                          {copiedCmd === p.installHint ? (
                            <Check className="w-3 h-3 text-[#4cc58a]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-white/[0.06] p-1.5 space-y-0.5">
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[12px] text-zinc-400">
            <span className="inline-flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-zinc-500" />
              {t('Aktif Ajanlar', 'Active Agents')}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] text-zinc-300">
              {activeSeatCount}
            </span>
          </div>

          {activeSession && (
            <button
              type="button"
              onClick={() => onSelectStage('blueprint')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[12px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <FileCode2 className="w-3.5 h-3.5 text-zinc-500" />
                {t('MD Dosyaları', 'MD Blueprints')}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] text-zinc-300">
                {blueprintCount}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Smart Quality-Matched & Custom Backup Agent Policy Card */}
      <div className="glass-panel rounded-2xl overflow-hidden shrink-0">
        <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300 tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5 text-[#3fd0c9]" />
            {t('Yedek Model', 'Backup Policy')}
          </span>
          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] text-zinc-400">
            {fallbackPolicy.mode === 'quality_auto'
              ? t('Eşit Kalite', 'Match Tier')
              : fallbackPolicy.mode === 'custom'
                ? t('Özel Ajan', 'Custom')
                : t('Onaylı', 'Ask Me')}
          </span>
        </div>

        <div className="p-2.5 space-y-2.5">
          {/* 3-Way Policy Switch */}
          <div className="grid grid-cols-3 gap-0.5 rounded-xl bg-black/35 border border-white/[0.06] p-0.5">
            {FALLBACK_MODES.map((m) => {
              const active = fallbackPolicy.mode === m.id;
              const label =
                m.id === 'quality_auto'
                  ? t('Kalite', 'Quality')
                  : m.id === 'custom'
                    ? t('Özel', 'Custom')
                    : t('Sor', 'Ask');
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModeClick(m.id)}
                  className={`py-1 rounded-lg text-[10.5px] font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-[#f7f8f8] text-[#060709]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {fallbackPolicy.mode === 'quality_auto' && (
            <div className="space-y-2">
              <p className="text-[10.5px] text-zinc-400 leading-relaxed">
                {t(
                  'Kota dolunca işin önemine göre eşit veya üst seviye çalışan modele geçer.',
                  'On quota hit, auto-switches only to an equal or higher-tier healthy pool.'
                )}
              </p>
              <label className="flex items-center justify-between gap-2 text-[10.5px] text-zinc-300 cursor-pointer pt-0.5">
                <span>{t('Düşük modeli engelle', 'Block downgrade')}</span>
                <input
                  type="checkbox"
                  checked={fallbackPolicy.preventDowngrade}
                  onChange={(e) =>
                    void onUpdateFallbackPolicy({
                      preventDowngrade: e.target.checked,
                    })
                  }
                  className="accent-[#3fd0c9] w-3.5 h-3.5 cursor-pointer"
                />
              </label>
            </div>
          )}

          {fallbackPolicy.mode === 'custom' && (
            <div className="space-y-1.5">
              <p className="text-[10.5px] text-zinc-400 leading-snug">
                {t(
                  'Kota dolunca doğrudan seçtiğin bu yedek ajan devralır:',
                  'Your chosen backup agent takes over automatically on quota hit:'
                )}
              </p>
              <select
                value={selectedCustomProvider}
                onChange={(e) => {
                  const p = e.target.value as ProviderId;
                  const info = providers.find((x) => x.id === p);
                  const firstHealthy =
                    info?.models.find(
                      (m) => !exhaustedPools.has(getQuotaPoolKey(p, m.id))
                    )?.id ||
                    info?.models[1]?.id ||
                    info?.models[0]?.id ||
                    'auto';
                  void onUpdateFallbackPolicy({
                    mode: 'custom',
                    customProvider: p,
                    customModel: firstHealthy,
                  });
                }}
                className="glass-input w-full text-[11px] rounded-xl px-2.5 py-1.5 text-zinc-200"
              >
                {installedProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedCustomModel}
                onChange={(e) =>
                  void onUpdateFallbackPolicy({
                    mode: 'custom',
                    customProvider: selectedCustomProvider,
                    customModel: e.target.value,
                  })
                }
                className="glass-input w-full text-[11px] font-mono rounded-xl px-2.5 py-1.5 text-[#cbc7ff]"
              >
                {(customProviderInfo?.models || []).map((m) => {
                  const isOut = exhaustedPools.has(
                    getQuotaPoolKey(selectedCustomProvider, m.id)
                  );
                  return (
                    <option key={m.id} value={m.id}>
                      {m.id}
                      {isOut ? ' (Kota Dolu)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {fallbackPolicy.mode === 'ask' && (
            <p className="text-[10.5px] text-zinc-400 leading-relaxed">
              {t(
                'Otomatik geçiş yapmaz. Kota dolunca durur; hangi ajanla tamamlayacağını sen seçersin.',
                'Never auto-switches. Pauses on quota hit so you pick the exact model yourself.'
              )}
            </p>
          )}

          {/* Active Quota Cooldowns */}
          {cooldowns.length > 0 && (
            <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#f7cf86]">
                  <AlertTriangle className="w-3 h-3" />
                  {t('Kota Dolu', 'Quota Hit')} ({cooldowns.length})
                </span>
                <button
                  type="button"
                  disabled={resettingQuota}
                  onClick={async () => {
                    setResettingQuota(true);
                    try {
                      await onResetCooldowns();
                    } finally {
                      setResettingQuota(false);
                    }
                  }}
                  className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer disabled:opacity-40"
                >
                  {t('Sıfırla', 'Reset')}
                </button>
              </div>
              {cooldowns.map((c) => (
                <div
                  key={c.pool}
                  title={c.reason}
                  className="text-[10px] font-mono px-2 py-1 rounded-lg bg-[#f0b44c]/10 border border-[#f0b44c]/25 text-[#fde3a7] truncate"
                >
                  {c.pool}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
