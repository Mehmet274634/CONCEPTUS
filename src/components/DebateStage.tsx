import { memo, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns2,
  Copy,
  FileCode2,
  Flame,
  FolderGit2,
  GitFork,
  Loader2,
  MessageSquarePlus,
  OctagonX,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Swords,
  Zap,
} from 'lucide-react';
import {
  DOMAIN_OPTIONS,
  getRoleDisplayLabel,
  PROVIDER_META,
  type BlueprintDepth,
  type BlueprintFileSpec,
  type DebateRound,
  type DebateSession,
  type DecisionGate,
  type FallbackPolicy,
  type GeneratedMdFile,
  type PoolCooldown,
  type ProviderId,
  type ProviderInfo,
  type SeatConfig,
  type SeatResponse,
  type UiMode,
} from '../types.ts';
import { BlueprintStage } from './BlueprintStage.tsx';
import { MarkdownView } from './MarkdownView.tsx';
import { SeatEditorList } from './SeatEditorList.tsx';
import { SynthesisCard } from './SynthesisCard.tsx';
import type { StageTab } from './TopBar.tsx';

interface DebateStageProps {
  session: DebateSession;
  providers: ProviderInfo[];
  cooldowns: PoolCooldown[];
  fallbackPolicy: FallbackPolicy;
  uiMode: UiMode;
  activeRun: boolean;
  autopilotStage: string;
  activeStage: StageTab;
  onSelectStage: (stage: StageTab) => void;
  onStartNextRound: (guidance: string, seats: SeatConfig[]) => Promise<void>;
  onStartRedTeam: (seatId?: string) => Promise<void>;
  onStartChallenge: (question: string, targetSeatId?: string) => Promise<void>;
  onForkSession: (options: { forkLabel?: string; extraConstraint?: string }) => Promise<void>;
  onStartSynthesis: (judge: {
    provider: ProviderId;
    model: string;
  }) => Promise<void>;
  onUpdateDecisionGates: (gates: DecisionGate[]) => void;
  onExtractGates: () => Promise<void>;
  extractingGates: boolean;
  onGenerateBlueprint: (options: {
    provider: ProviderId;
    model: string;
    depth: BlueprintDepth;
    files: BlueprintFileSpec[];
  }) => Promise<void>;
  onRegenerateBlueprintFile: (
    fileId: string,
    options: {
      provider: ProviderId;
      model: string;
      depth: BlueprintDepth;
      revisionNote?: string;
    }
  ) => Promise<void>;
  onRetryFailedBlueprint: (options?: {
    depth?: BlueprintDepth;
    provider?: ProviderId;
    model?: string;
  }) => Promise<void>;
  onRunLint: () => Promise<void>;
  onRunAudit: (auditor: { provider: ProviderId; model: string }) => Promise<void>;
  onFixAuditIssues: (options: {
    issueIds: string[];
    provider: ProviderId;
    model: string;
  }) => Promise<void>;
  onBlueprintFileUpdated: (file: GeneratedMdFile) => void;
  onAbort: () => Promise<void>;
  onSeatsChange: (seats: SeatConfig[]) => void;
}

function LiveTimer({
  startedAt,
  durationMs,
}: {
  startedAt?: number;
  durationMs?: number;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (durationMs !== undefined || !startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt, durationMs]);

  const ms = durationMs ?? (startedAt ? Math.max(0, now - startedAt) : 0);
  if (!ms) return null;
  return (
    <span className="font-mono text-[11px] text-zinc-500">
      {(ms / 1000).toFixed(1)}s
    </span>
  );
}

const ResponseCard = memo(function ResponseCard({
  response,
}: {
  response: SeatResponse;
}) {
  const [copied, setCopied] = useState(false);
  const meta = PROVIDER_META[response.provider];
  const roleLabel = getRoleDisplayLabel(response.role, response.customRoleTitle);

  const handleCopy = () => {
    navigator.clipboard.writeText(response.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`glass-card rounded-2xl flex flex-col overflow-hidden ${
        response.status === 'running'
          ? meta.ring
          : response.status === 'error'
            ? 'border-[#ff7a6e]/35'
            : ''
      }`}
    >
      <div className="px-4 py-3 border-b border-white/[0.07] bg-white/[0.015] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
          <span className="text-[13px] font-semibold text-white truncate">
            {response.seatLabel}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
            {response.anonymousId}
          </span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${meta.badge}`}
          >
            {response.model}
          </span>
          {response.fallbackFrom && (
            <span
              title={`Kota/limit nedeniyle ${response.fallbackFrom} yerine otomatik yedek model devraldı`}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f0b44c]/15 text-[#f7cf86] border border-[#f0b44c]/30"
            >
              ↻ Yedek
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400">
            {roleLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <LiveTimer
            startedAt={response.startedAt}
            durationMs={response.durationMs}
          />
          {response.status === 'running' && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#958fff]" />
          )}
          {response.status === 'done' && (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#4cc58a]" />
          )}
          {response.status === 'error' && (
            <AlertTriangle className="w-3.5 h-3.5 text-[#ff7a6e]" />
          )}
          {response.status === 'aborted' && (
            <OctagonX className="w-3.5 h-3.5 text-zinc-500" />
          )}

          {response.content && (
            <button
              onClick={handleCopy}
              title="Kopyala"
              className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-[#4cc58a]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5 flex-1 overflow-y-auto max-h-[60vh]">
        {response.status === 'error' ? (
          <div className="rounded-xl bg-[#ff7a6e]/10 border border-[#ff7a6e]/25 p-3.5 text-xs text-[#ffb4ad] space-y-1">
            <p className="font-semibold">Bu ajan yanıt üretemedi</p>
            <p className="opacity-90 leading-relaxed">{response.error}</p>
          </div>
        ) : response.status === 'aborted' && !response.content ? (
          <div className="py-10 text-center text-xs text-zinc-500">
            Durduruldu.
          </div>
        ) : response.content ? (
          <>
            <MarkdownView content={response.content} />
            {response.status === 'running' && (
              <span className="inline-block w-2 h-4 ml-1 bg-[#958fff] animate-pulse align-middle rounded-sm" />
            )}
          </>
        ) : (
          <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin text-[#958fff]" />
            <span>Düşünüyor...</span>
          </div>
        )}
      </div>
    </div>
  );
});

export function DebateStage({
  session,
  providers,
  cooldowns,
  fallbackPolicy,
  uiMode,
  activeRun,
  autopilotStage,
  activeStage,
  onSelectStage,
  onStartNextRound,
  onStartRedTeam,
  onStartChallenge,
  onForkSession,
  onStartSynthesis,
  onUpdateDecisionGates,
  onExtractGates,
  extractingGates,
  onGenerateBlueprint,
  onRegenerateBlueprintFile,
  onRetryFailedBlueprint,
  onRunLint,
  onRunAudit,
  onFixAuditIssues,
  onBlueprintFileUpdated,
  onAbort,
  onSeatsChange,
}: DebateStageProps) {
  const [selectedRoundNum, setSelectedRoundNum] = useState<number>(
    session.rounds[session.rounds.length - 1]?.roundNumber || 1
  );
  const [layout, setLayout] = useState<'grid' | 'focus'>('grid');
  const [focusedSeatId, setFocusedSeatId] = useState<string | null>(null);
  const [showIdeaBox, setShowIdeaBox] = useState(false);
  const [showSeatEditor, setShowSeatEditor] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [challengeTarget, setChallengeTarget] = useState<string>('round');
  const [showForkBox, setShowForkBox] = useState(false);
  const [forkLabel, setForkLabel] = useState('');
  const [forkConstraint, setForkConstraint] = useState('');
  const [forking, setForking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const defaultJudge = useMemo(() => {
    const installedIds = new Set(
      providers.filter((p) => p.installed).map((p) => p.id)
    );
    const activeInstalled = session.seats.find(
      (s) => s.enabled && installedIds.has(s.provider)
    );
    if (activeInstalled) {
      return {
        provider: activeInstalled.provider,
        model: activeInstalled.model,
      };
    }
    const first = providers.find((p) => p.installed) || providers[0];
    return {
      provider: (first?.id || 'antigravity') as ProviderId,
      model: first?.models[1]?.id || first?.models[0]?.id || 'auto',
    };
  }, [providers, session.seats]);

  const [judgeProvider, setJudgeProvider] = useState<ProviderId>(
    defaultJudge.provider
  );
  const [judgeModel, setJudgeModel] = useState<string>(defaultJudge.model);

  useEffect(() => {
    setJudgeProvider(defaultJudge.provider);
    setJudgeModel(defaultJudge.model);
  }, [session.id]);

  useEffect(() => {
    if (session.rounds.length > 0) {
      setSelectedRoundNum(session.rounds[session.rounds.length - 1].roundNumber);
    }
  }, [session.rounds.length]);

  const judgeProviderInfo = providers.find((p) => p.id === judgeProvider);
  const domainShort =
    DOMAIN_OPTIONS.find((d) => d.id === session.domain)?.short || session.domain;

  const activeRound: DebateRound | undefined = useMemo(
    () =>
      session.rounds.find((r) => r.roundNumber === selectedRoundNum) ||
      session.rounds[session.rounds.length - 1],
    [session.rounds, selectedRoundNum]
  );

  const visibleResponses = useMemo(() => {
    if (!activeRound) return [];
    if (layout === 'focus') {
      const target =
        activeRound.responses.find((r) => r.seatId === focusedSeatId) ||
        activeRound.responses[0];
      return target ? [target] : [];
    }
    return activeRound.responses;
  }, [activeRound, layout, focusedSeatId]);

  const handleNextRound = async () => {
    setActionError(null);
    try {
      onSelectStage('debate');
      if (challengeTarget !== 'round') {
        if (!guidance.trim()) {
          setActionError('Canlı müdahale için sorunuzu veya itirazınızı yazın.');
          return;
        }
        await onStartChallenge(guidance.trim(), challengeTarget);
      } else {
        await onStartNextRound(guidance, session.seats);
      }
      setGuidance('');
      setShowSeatEditor(false);
    } catch (err: any) {
      setActionError(err?.message || 'Yeni tur başlatılamadı.');
    }
  };

  const handleRedTeamClick = async () => {
    setActionError(null);
    try {
      onSelectStage('debate');
      await onStartRedTeam();
    } catch (err: any) {
      setActionError(err?.message || 'Şeytanın Avukatı (Red-Team) başlatılamadı.');
    }
  };

  const handleForkSubmit = async () => {
    setActionError(null);
    setForking(true);
    try {
      await onForkSession({
        forkLabel: forkLabel.trim() || 'Alternatif Senaryo',
        extraConstraint: forkConstraint.trim() || undefined,
      });
      setShowForkBox(false);
      setForkLabel('');
      setForkConstraint('');
    } catch (err: any) {
      setActionError(err?.message || 'Senaryo çatallanamadı.');
    } finally {
      setForking(false);
    }
  };

  const handleSynthesize = async () => {
    setActionError(null);
    try {
      onSelectStage('synthesis');
      await onStartSynthesis({ provider: judgeProvider, model: judgeModel });
    } catch (err: any) {
      setActionError(err?.message || 'Master Karar başlatılamadı.');
    }
  };

  const nextRoundNum = session.rounds.length + 1;
  const activeSeatCount = session.seats.filter((s) => s.enabled).length;

  if (activeStage === 'blueprint') {
    return (
      <BlueprintStage
        session={session}
        providers={providers}
        cooldowns={cooldowns}
        fallbackPolicy={fallbackPolicy}
        uiMode={uiMode}
        activeRun={activeRun}
        onGeneratePack={onGenerateBlueprint}
        onRegenerateFile={onRegenerateBlueprintFile}
        onRetryFailedFiles={onRetryFailedBlueprint}
        onRunLint={onRunLint}
        onRunAudit={onRunAudit}
        onFixAuditIssues={onFixAuditIssues}
        onFileContentUpdated={onBlueprintFileUpdated}
        onAbort={onAbort}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Auto-Pilot Live Progress Strip */}
      {autopilotStage && activeRun && (
        <div className="px-5 sm:px-8 py-2 bg-[#7c74ff]/15 border-b border-[#7c74ff]/30 flex items-center justify-between gap-3 text-xs text-[#d6d3ff] shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[#958fff] animate-pulse" />
            <span className="font-medium">{autopilotStage}</span>
          </div>
          <button
            onClick={onAbort}
            className="text-[11px] font-semibold text-[#ffb4ad] hover:text-white cursor-pointer"
          >
            Durdur
          </button>
        </div>
      )}

      {/* Slim Sub-Header */}
      <div className="px-5 sm:px-8 py-2.5 border-b border-white/[0.06] bg-black/25 flex items-center justify-between gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
            {domainShort}
          </span>
          {session.repoMeta && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#3fd0c9]/10 text-[#88ece7] border border-[#3fd0c9]/25">
              <FolderGit2 className="w-3 h-3" />
              {session.repoMeta.rootName}
            </span>
          )}
          <button
            onClick={() => setShowIdeaBox(!showIdeaBox)}
            className="text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
          >
            {showIdeaBox ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            Fikir & Kısıtlar
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeStage === 'debate' && (
            <>
              <div className="flex items-center gap-1">
                {session.rounds.map((r) => {
                  const active = activeRound?.roundNumber === r.roundNumber;
                  const running = r.responses.some((x) => x.status === 'running');
                  return (
                    <button
                      key={r.roundNumber}
                      onClick={() => setSelectedRoundNum(r.roundNumber)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer inline-flex items-center gap-1.5 ${
                        active
                          ? 'bg-white/[0.12] text-white'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      {running && (
                        <Loader2 className="w-3 h-3 animate-spin text-[#958fff]" />
                      )}
                      Tur {r.roundNumber}
                    </button>
                  );
                })}
              </div>

              <div className="h-4 w-px bg-white/10 hidden sm:block" />

              <div className="flex items-center rounded-full bg-white/[0.04] border border-white/[0.08] p-0.5">
                <button
                  onClick={() => setLayout('grid')}
                  className={`px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 transition cursor-pointer ${
                    layout === 'grid'
                      ? 'bg-white/12 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Columns2 className="w-3 h-3" />
                  Yan Yana
                </button>
                <button
                  onClick={() => setLayout('focus')}
                  className={`px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 transition cursor-pointer ${
                    layout === 'focus'
                      ? 'bg-white/12 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Square className="w-3 h-3" />
                  Odak
                </button>
              </div>
            </>
          )}

          {activeRun && (
            <button
              onClick={onAbort}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-[#ff7a6e]/15 hover:bg-[#ff7a6e]/25 text-[#ffb4ad] border border-[#ff7a6e]/35 font-semibold cursor-pointer"
            >
              <OctagonX className="w-3.5 h-3.5" />
              Durdur
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Idea Box */}
      {showIdeaBox && (
        <div className="px-5 sm:px-8 py-3.5 bg-black/40 border-b border-white/[0.07] text-xs space-y-2 shrink-0 max-h-48 overflow-y-auto">
          <p className="text-zinc-200 whitespace-pre-wrap leading-relaxed">
            {session.idea}
          </p>
          {session.constraints && (
            <p className="text-zinc-400 whitespace-pre-wrap">
              <strong className="text-zinc-300">Kısıtlar:</strong>{' '}
              {session.constraints}
            </p>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-5 sm:px-8 py-5">
        {activeStage === 'synthesis' ? (
          <div className="max-w-4xl mx-auto">
            {session.synthesis ? (
              <SynthesisCard
                sessionId={session.id}
                synthesis={session.synthesis}
                onUpdateDecisionGates={onUpdateDecisionGates}
                onExtractGates={onExtractGates}
                extractingGates={extractingGates}
                onGoToBlueprint={() => onSelectStage('blueprint')}
              />
            ) : (
              <div className="glass-panel rounded-3xl p-10 text-center space-y-4">
                <Sparkles className="w-7 h-7 text-[#958fff] mx-auto" />
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Master Karar henüz üretilmedi
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                    Ajanların tartışmasından memnunsan alttaki Hakem modelini seçip tek tıkla kesinleşmiş Master Kararı çıkarabilirsin.
                  </p>
                </div>
                <button
                  onClick={handleSynthesize}
                  disabled={activeRun || session.rounds.length === 0}
                  className="btn-white px-5 py-2.5 text-xs inline-flex items-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Master Kararı Üret
                </button>
              </div>
            )}
          </div>
        ) : activeRound ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-sm font-semibold text-zinc-100">
                  Tur {activeRound.roundNumber} · {activeRound.title}
                </h3>
                {activeRound.userGuidance && (
                  <span className="text-xs text-[#cbc7ff] bg-[#7c74ff]/12 border border-[#7c74ff]/25 rounded-full px-3 py-0.5">
                    “{activeRound.userGuidance}”
                  </span>
                )}
              </div>

              {layout === 'focus' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {activeRound.responses.map((r) => {
                    const isFocused =
                      (focusedSeatId || activeRound.responses[0]?.seatId) ===
                      r.seatId;
                    return (
                      <button
                        key={r.seatId}
                        onClick={() => setFocusedSeatId(r.seatId)}
                        className={`px-3 py-1 rounded-full text-xs transition cursor-pointer ${
                          isFocused
                            ? 'bg-white/15 text-white'
                            : 'bg-white/[0.04] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {r.seatLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              className={`grid gap-4 ${
                layout === 'focus' || visibleResponses.length === 1
                  ? 'grid-cols-1 max-w-4xl mx-auto'
                  : visibleResponses.length === 2
                    ? 'grid-cols-1 xl:grid-cols-2'
                    : 'grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3'
              }`}
            >
              {visibleResponses.map((resp) => (
                <ResponseCard
                  key={`${activeRound.roundNumber}-${resp.seatId}`}
                  response={resp}
                />
              ))}
            </div>
          </div>
        ) : null}
      </main>

      {/* Collapsible Seat / Role / Model Editor */}
      {showSeatEditor && (
        <div className="border-t border-white/[0.08] glass-bar px-5 sm:px-8 py-4 max-h-72 overflow-y-auto shrink-0">
          <SeatEditorList
            seats={session.seats}
            providers={providers}
            onChange={onSeatsChange}
            compact
          />
        </div>
      )}

      {/* Floating Frosted Bottom Control Dock (Live Idea War Room Controls) */}
      <footer className="border-t glass-bar px-5 sm:px-8 py-3 shrink-0 space-y-2">
        {actionError && (
          <div className="text-xs text-[#ffb4ad] bg-[#ff7a6e]/10 border border-[#ff7a6e]/25 rounded-xl px-3 py-1.5">
            {actionError}
          </div>
        )}

        {showForkBox && (
          <div className="rounded-2xl bg-[#7c74ff]/[0.07] border border-[#7c74ff]/30 p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={forkLabel}
              onChange={(e) => setForkLabel(e.target.value)}
              placeholder="Dal adı (örn: SaaS Versiyonu)"
              className="glass-input text-xs rounded-full px-3 py-1.5 text-zinc-100 placeholder:text-zinc-500 sm:w-44"
            />
            <input
              type="text"
              value={forkConstraint}
              onChange={(e) => setForkConstraint(e.target.value)}
              placeholder="What-If değişikliği (örn: Yerel yerine çok kullanıcılı bulut abonelik olsun)"
              className="glass-input flex-1 text-xs rounded-full px-3 py-1.5 text-zinc-100 placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={handleForkSubmit}
              disabled={forking}
              className="btn-white text-xs px-3.5 py-1.5 cursor-pointer disabled:opacity-40"
            >
              {forking ? 'Çatallanıyor...' : 'Yeni Dal Oluştur'}
            </button>
          </div>
        )}

        <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2.5">
          <div className="flex items-center gap-1.5 flex-1">
            <select
              value={challengeTarget}
              disabled={activeRun}
              onChange={(e) => setChallengeTarget(e.target.value)}
              title="Tartışma Turu veya Doğrudan @Ajan Müdahalesi"
              className="glass-input text-[11px] font-medium rounded-full px-3 py-2 text-[#cbc7ff] cursor-pointer shrink-0 max-w-[140px]"
            >
              <option value="round">Delta Tur</option>
              <option value="all">@Tümü Sor</option>
              {session.seats
                .filter((s) => s.enabled)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    @{s.label}
                  </option>
                ))}
            </select>

            <div className="relative flex-1">
              <MessageSquarePlus className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                disabled={activeRun}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !activeRun) {
                    e.preventDefault();
                    void handleNextRound();
                  }
                }}
                placeholder={
                  challengeTarget !== 'round'
                    ? 'Seçili ajana doğrudan soru sor veya itiraz et...'
                    : nextRoundNum === 2
                      ? 'İsteğe bağlı yönlendirme yaz veya boş bırakıp Delta çatışmayı başlat...'
                      : 'Araya gir: "Örn. Maliyeti sıfır tutun, kapsamı 3 ekrana daraltın"...'
                }
                className="glass-input w-full pl-10 pr-4 py-2 text-xs rounded-full text-zinc-100 placeholder:text-zinc-500 disabled:opacity-40"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {uiMode === 'pro' && (
              <button
                type="button"
                onClick={() => setShowSeatEditor(!showSeatEditor)}
                disabled={activeRun}
                className={`glass-pill inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium cursor-pointer disabled:opacity-40 ${
                  showSeatEditor ? 'bg-white/15 text-white' : 'text-zinc-300'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Ajanlar
              </button>
            )}

            <button
              type="button"
              onClick={handleRedTeamClick}
              disabled={activeRun || session.rounds.length === 0}
              title="Şeytanın Avukatı (Red-Team): Fikrin en ölümcül 5 riskini acımasızca bulur"
              className="glass-pill inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-[#ffb4ad] border-[#ff7a6e]/30 hover:bg-[#ff7a6e]/15 cursor-pointer disabled:opacity-40"
            >
              <Flame className="w-3.5 h-3.5" />
              Red-Team
            </button>

            <button
              type="button"
              onClick={() => setShowForkBox((v) => !v)}
              disabled={activeRun}
              title="What-If Senaryo Çatalla: Mevcut oturumu bozmadan alternatif yol dene"
              className={`glass-pill inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium cursor-pointer disabled:opacity-40 ${
                showForkBox ? 'bg-[#7c74ff]/20 text-[#cbc7ff] border-[#7c74ff]/40' : 'text-zinc-300'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              Çatalla
            </button>

            <button
              type="button"
              onClick={handleNextRound}
              disabled={activeRun || activeSeatCount === 0}
              className="btn-accent inline-flex items-center gap-1.5 px-4 py-2 text-xs cursor-pointer disabled:opacity-40"
            >
              {challengeTarget !== 'round' ? (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Sor
                </>
              ) : nextRoundNum === 2 ? (
                <>
                  <Swords className="w-3.5 h-3.5" />
                  Delta Tartıştır
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  +1 Tur (v{nextRoundNum})
                </>
              )}
            </button>

            {uiMode === 'simple' ? (
              <button
                type="button"
                onClick={handleSynthesize}
                disabled={activeRun || session.rounds.length === 0}
                className="btn-white inline-flex items-center gap-1.5 px-4 py-2 text-xs cursor-pointer disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Master Karar
              </button>
            ) : (
              <div className="flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/[0.10] p-1 pl-2.5">
                <select
                  value={judgeProvider}
                  disabled={activeRun}
                  onChange={(e) => {
                    const p = e.target.value as ProviderId;
                    setJudgeProvider(p);
                    const info = providers.find((x) => x.id === p);
                    setJudgeModel(
                      info?.models[1]?.id || info?.models[0]?.id || 'default'
                    );
                  }}
                  className="text-[11px] bg-transparent text-zinc-300 focus:outline-none cursor-pointer"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <select
                  value={judgeModel}
                  disabled={activeRun}
                  onChange={(e) => setJudgeModel(e.target.value)}
                  className="text-[11px] font-mono bg-white/[0.06] text-[#cbc7ff] rounded-full px-2 py-1 focus:outline-none max-w-[130px] cursor-pointer"
                >
                  {(
                    judgeProviderInfo?.models || [
                      { id: 'default', label: 'default' },
                    ]
                  ).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleSynthesize}
                  disabled={activeRun || session.rounds.length === 0}
                  className="btn-white inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs cursor-pointer disabled:opacity-40"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Master Karar
                </button>
              </div>
            )}

            {session.synthesis?.status === 'done' && (
              <button
                type="button"
                onClick={() => onSelectStage('blueprint')}
                className="glass-pill inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold text-[#88ece7] border-[#3fd0c9]/35 cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                MD Paketi
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
