import { useCallback, useEffect, useRef, useState } from 'react';
import {
  abortRun,
  createSession,
  extractSessionDecisionGates,
  fetchProvidersState,
  fetchSession,
  fetchSessions,
  removeSession,
  resetQuotaCooldowns,
  saveDecisionGates,
  subscribeSessionStream,
  triggerAutoPilot,
  triggerBlueprintAudit,
  triggerBlueprintFix,
  triggerBlueprintGeneration,
  triggerBlueprintLint,
  triggerForkSession,
  triggerRedTeam,
  triggerRegenerateFile,
  triggerRetryFailedBlueprint,
  triggerRound,
  triggerSynthesis,
  triggerTargetedChallenge,
  updateFallbackPolicy,
  updateSessionSeats,
} from './api.ts';
import { DebateStage } from './components/DebateStage.tsx';
import { LeftRail } from './components/LeftRail.tsx';
import { RightToolsBox } from './components/RightToolsBox.tsx';
import { SetupStage } from './components/SetupStage.tsx';
import { TopBar, type StageTab } from './components/TopBar.tsx';
import { useI18n } from './i18n.tsx';
import type {
  BlueprintDepth,
  BlueprintFileSpec,
  CaliberPreference,
  DebateSession,
  DecisionGate,
  DomainMode,
  FallbackPolicy,
  GeneratedMdFile,
  PoolCooldown,
  ProviderId,
  ProviderInfo,
  RepoSnapshotMeta,
  SeatConfig,
  SessionSummary,
  SimplePresetId,
  StreamEvent,
  UiMode,
} from './types.ts';

function pickFrom(info: ProviderInfo | undefined, candidates: string[], fallback: string): string {
  if (!info) return fallback;
  for (const id of candidates) {
    if (info.models.some((m) => m.id === id)) return id;
  }
  return info.models[1]?.id || info.models[0]?.id || fallback;
}

function buildSeatsForPreset(
  providers: ProviderInfo[],
  preset: SimplePresetId = 'balanced'
): SeatConfig[] {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const seats: SeatConfig[] = [];

  const agy = byId.get('antigravity');
  if (agy && agy.installed) {
    const geminiMap: Record<SimplePresetId, string[]> = {
      fast: ['gemini-3.8-flash-medium', 'gemini-3.8-flash-low', 'gemini-4-neon-low'],
      balanced: ['gemini-4-neon-medium', 'gemini-4-argon-medium', 'gemini-4-neon-high'],
      deep: ['gemini-4-neon-high', 'gemini-4-neon-xhigh', 'gemini-4-argon-high'],
    };
    const claudeMap: Record<SimplePresetId, string[]> = {
      fast: ['claude-sonnet-5-5-low', 'claude-sonnet-5-5-medium', 'gemini-3.8-flash-high'],
      balanced: ['claude-opus-5-5-medium', 'claude-sonnet-5-5-high', 'claude-opus-5-5-high'],
      deep: ['claude-opus-5-5-high', 'claude-opus-5-5-medium', 'claude-sonnet-5-5-high'],
    };

    seats.push({
      id: 'seat_agy_gemini',
      label: 'Gemini · Mimar',
      provider: 'antigravity',
      model: pickFrom(agy, geminiMap[preset], 'auto'),
      role: 'chief_architect',
      effort: 'default',
      economyMode: preset === 'fast',
      enabled: true,
    });

    seats.push({
      id: 'seat_agy_claude',
      label: 'Claude · Risk',
      provider: 'antigravity',
      model: pickFrom(agy, claudeMap[preset], 'auto'),
      role: 'risk_auditor',
      effort: 'default',
      economyMode: preset === 'fast',
      enabled: true,
    });
  }

  const codex = byId.get('codex');
  if (codex) {
    const codexMap: Record<SimplePresetId, string[]> = {
      fast: ['gpt-5.6-luna', 'gpt-6-luna'],
      balanced: ['gpt-6-luna', 'gpt-5.6-terra'],
      deep: ['gpt-6-luna', 'gpt-5.6-terra'],
    };
    seats.push({
      id: 'seat_codex_1',
      label: 'Codex · MVP',
      provider: 'codex',
      model: pickFrom(codex, codexMap[preset], 'default'),
      role: 'mvp_pragmatist',
      effort: preset === 'fast' ? 'low' : preset === 'deep' ? 'high' : 'medium',
      economyMode: preset !== 'deep',
      enabled: codex.installed,
    });
  }

  const claude = byId.get('claude');
  if (claude) {
    seats.push({
      id: 'seat_claude_1',
      label: 'Claude Code · Ürün',
      provider: 'claude',
      model: preset === 'deep' ? 'opus' : preset === 'fast' ? 'haiku' : 'sonnet',
      role: 'product_ux',
      effort: 'default',
      economyMode: preset === 'fast',
      enabled: claude.installed && (preset === 'deep' || !(agy && agy.installed)),
    });
  }

  const geminiCli = byId.get('gemini');
  if (geminiCli && geminiCli.installed && preset === 'deep' && seats.filter((s) => s.enabled).length < 4) {
    seats.push({
      id: 'seat_gemini_cli',
      label: 'Gemini CLI · Ölçek',
      provider: 'gemini',
      model: pickFrom(geminiCli, ['gemini-2.5-pro', 'auto'], 'auto'),
      role: 'growth_strategist',
      effort: 'default',
      economyMode: false,
      enabled: true,
    });
  }

  if (seats.filter((s) => s.enabled).length === 1) {
    const base = seats.find((s) => s.enabled)!;
    const info = byId.get(base.provider);
    const altModel =
      info?.models.find(
        (m) => m.id !== base.model && m.id !== 'default' && m.id !== 'auto'
      )?.id || base.model;
    seats.push({
      id: 'seat_counter_2',
      label: `${info?.name || base.provider} · Risk`,
      provider: base.provider,
      model: altModel,
      role: 'risk_auditor',
      effort: base.effort,
      economyMode: base.economyMode,
      enabled: true,
    });
  }

  return seats;
}

function pickDefaultJudge(
  providers: ProviderInfo[],
  seats: SeatConfig[]
): { provider: ProviderId; model: string } {
  const agy = providers.find((p) => p.id === 'antigravity' && p.installed);
  if (agy) {
    const pref = ['gemini-4-neon-high', 'gemini-4-neon-medium', 'claude-opus-5-5-medium'];
    for (const m of pref) {
      if (agy.models.some((x) => x.id === m)) {
        return { provider: 'antigravity', model: m };
      }
    }
  }
  const active = seats.find((s) => s.enabled);
  if (active) return { provider: active.provider, model: active.model };
  const first = providers.find((p) => p.installed) || providers[0];
  return {
    provider: (first?.id || 'antigravity') as ProviderId,
    model: first?.models[1]?.id || first?.models[0]?.id || 'auto',
  };
}

export default function App() {
  const { lang } = useI18n();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [cooldowns, setCooldowns] = useState<PoolCooldown[]>([]);
  const [fallbackPolicy, setFallbackPolicy] = useState<FallbackPolicy>({
    mode: 'quality_auto',
    preventDowngrade: true,
  });
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<DebateSession | null>(null);
  const [activeStage, setActiveStage] = useState<StageTab>('debate');
  const [activeRun, setActiveRun] = useState(false);
  const [autopilotStage, setAutopilotStage] = useState('');
  const [extractingGates, setExtractingGates] = useState(false);
  const [draftSeats, setDraftSeats] = useState<SeatConfig[]>([]);
  const [activePreset, setActivePreset] = useState<SimplePresetId>('balanced');
  const [uiMode, setUiMode] = useState<UiMode>(() => {
    const saved = localStorage.getItem('conceptus_ui_mode');
    return saved === 'simple' ? 'simple' : 'pro';
  });
  const [submitting, setSubmitting] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const handleUiModeChange = (mode: UiMode) => {
    setUiMode(mode);
    localStorage.setItem('conceptus_ui_mode', mode);
  };

  const handleApplySimplePreset = (preset: SimplePresetId) => {
    setActivePreset(preset);
    if (providers.length > 0) {
      setDraftSeats(buildSeatsForPreset(providers, preset));
    }
  };

  const deltaBufferRef = useRef<{
    seats: Map<string, { roundNumber: number; seatId: string; text: string }>;
    synthesis: string;
    blueprintFiles: Map<string, string>;
  }>({
    seats: new Map(),
    synthesis: '',
    blueprintFiles: new Map(),
  });

  const loadProviders = useCallback(async (refresh = false) => {
    setLoadingProviders(true);
    try {
      const state = await fetchProvidersState(refresh);
      setProviders(state.providers);
      setCooldowns(state.cooldowns);
      setFallbackPolicy(state.fallbackPolicy);
      setDraftSeats((prev) =>
        prev.length === 0 ? buildSeatsForPreset(state.providers, activePreset) : prev
      );
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  const handleUpdateFallbackPolicy = async (patch: Partial<FallbackPolicy>) => {
    const updated = await updateFallbackPolicy(patch);
    setFallbackPolicy(updated);
  };

  const handleResetCooldowns = async () => {
    const next = await resetQuotaCooldowns();
    setCooldowns(next);
  };

  const loadSessionsList = useCallback(async () => {
    try {
      const list = await fetchSessions();
      setSessions(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadProviders(false);
    void loadSessionsList();
  }, [loadProviders, loadSessionsList]);

  useEffect(() => {
    if (!activeSession?.id) return;
    const sessionId = activeSession.id;

    const flushTimer = window.setInterval(() => {
      const buf = deltaBufferRef.current;
      if (
        buf.seats.size === 0 &&
        buf.synthesis === '' &&
        buf.blueprintFiles.size === 0
      ) {
        return;
      }

      const seatDeltas = Array.from(buf.seats.values());
      const synthDelta = buf.synthesis;
      const bpDeltas = new Map(buf.blueprintFiles);

      buf.seats.clear();
      buf.synthesis = '';
      buf.blueprintFiles.clear();

      setActiveSession((prev) => {
        if (!prev || prev.id !== sessionId) return prev;
        let next = prev;

        if (seatDeltas.length > 0) {
          next = {
            ...next,
            rounds: next.rounds.map((r) => {
              const relevant = seatDeltas.filter(
                (d) => d.roundNumber === r.roundNumber
              );
              if (relevant.length === 0) return r;
              return {
                ...r,
                responses: r.responses.map((resp) => {
                  const found = relevant.find((d) => d.seatId === resp.seatId);
                  return found
                    ? { ...resp, content: resp.content + found.text }
                    : resp;
                }),
              };
            }),
          };
        }

        if (synthDelta && next.synthesis) {
          next = {
            ...next,
            synthesis: {
              ...next.synthesis,
              content: next.synthesis.content + synthDelta,
            },
          };
        }

        if (bpDeltas.size > 0 && next.blueprint) {
          next = {
            ...next,
            blueprint: {
              ...next.blueprint,
              files: next.blueprint.files.map((f) => {
                const add = bpDeltas.get(f.id);
                return add ? { ...f, content: f.content + add } : f;
              }),
            },
          };
        }

        return next;
      });
    }, 65);

    const unsubscribe = subscribeSessionStream(sessionId, (event: StreamEvent) => {
      const buf = deltaBufferRef.current;

      if (event.type === 'seat_delta') {
        const key = `${event.roundNumber}:${event.seatId}`;
        const existing = buf.seats.get(key);
        if (existing) existing.text += event.delta;
        else
          buf.seats.set(key, {
            roundNumber: event.roundNumber,
            seatId: event.seatId,
            text: event.delta,
          });
        return;
      }

      if (event.type === 'synthesis_delta') {
        buf.synthesis += event.delta;
        return;
      }

      if (event.type === 'blueprint_file_delta') {
        buf.blueprintFiles.set(
          event.fileId,
          (buf.blueprintFiles.get(event.fileId) || '') + event.delta
        );
        return;
      }

      if (event.type === 'autopilot_stage') {
        setAutopilotStage(event.stage);
        if (!event.stage) setActiveRun(false);
        return;
      }

      if (event.type === 'session_snapshot') {
        buf.seats.clear();
        buf.synthesis = '';
        buf.blueprintFiles.clear();
        setActiveSession(event.session);
        setActiveRun(event.activeRun);
        return;
      }

      if (event.type === 'round_started') {
        setActiveRun(true);
        setActiveStage('debate');
        setActiveSession((prev) => {
          if (!prev || prev.id !== sessionId) return prev;
          const exists = prev.rounds.some(
            (r) => r.roundNumber === event.round.roundNumber
          );
          const rounds = exists
            ? prev.rounds.map((r) =>
                r.roundNumber === event.round.roundNumber ? event.round : r
              )
            : [...prev.rounds, event.round];
          return { ...prev, rounds };
        });
        void loadSessionsList();
        return;
      }

      if (event.type === 'seat_started') {
        setActiveSession((prev) => {
          if (!prev || prev.id !== sessionId) return prev;
          return {
            ...prev,
            rounds: prev.rounds.map((r) =>
              r.roundNumber !== event.roundNumber
                ? r
                : {
                    ...r,
                    responses: r.responses.map((resp) =>
                      resp.seatId === event.seatId
                        ? { ...resp, status: 'running', startedAt: Date.now() }
                        : resp
                    ),
                  }
            ),
          };
        });
        return;
      }

      if (event.type === 'seat_completed') {
        buf.seats.delete(`${event.roundNumber}:${event.response.seatId}`);
        setActiveSession((prev) => {
          if (!prev || prev.id !== sessionId) return prev;
          return {
            ...prev,
            rounds: prev.rounds.map((r) =>
              r.roundNumber !== event.roundNumber
                ? r
                : {
                    ...r,
                    responses: r.responses.map((resp) =>
                      resp.seatId === event.response.seatId ? event.response : resp
                    ),
                  }
            ),
          };
        });
        return;
      }

      if (event.type === 'round_completed') {
        setActiveSession((prev) => {
          if (!prev || prev.id !== sessionId) return prev;
          return {
            ...prev,
            rounds: prev.rounds.map((r) =>
              r.roundNumber === event.roundNumber
                ? { ...r, finishedAt: event.finishedAt }
                : r
            ),
          };
        });
        // Only clear activeRun if not in the middle of Auto-Pilot
        setAutopilotStage((stage) => {
          if (!stage) setActiveRun(false);
          return stage;
        });
        void loadSessionsList();
        return;
      }

      if (event.type === 'synthesis_started') {
        buf.synthesis = '';
        setActiveRun(true);
        setActiveStage('synthesis');
        setActiveSession((prev) =>
          prev && prev.id === sessionId
            ? { ...prev, synthesis: event.synthesis }
            : prev
        );
        return;
      }

      if (event.type === 'synthesis_completed') {
        buf.synthesis = '';
        setActiveRun(false);
        setAutopilotStage('');
        setActiveSession((prev) =>
          prev && prev.id === sessionId
            ? { ...prev, synthesis: event.synthesis }
            : prev
        );
        void loadSessionsList();
        return;
      }

      if (event.type === 'blueprint_started') {
        buf.blueprintFiles.clear();
        setActiveRun(true);
        setActiveStage('blueprint');
        setActiveSession((prev) =>
          prev && prev.id === sessionId
            ? { ...prev, blueprint: event.blueprint }
            : prev
        );
        return;
      }

      if (event.type === 'blueprint_contract_ready') {
        setActiveSession((prev) =>
          prev && prev.id === sessionId && prev.blueprint
            ? {
                ...prev,
                blueprint: { ...prev.blueprint, contract: event.contract },
              }
            : prev
        );
        return;
      }

      if (event.type === 'blueprint_lint_completed') {
        setActiveSession((prev) =>
          prev && prev.id === sessionId && prev.blueprint
            ? {
                ...prev,
                blueprint: { ...prev.blueprint, lint: event.lint },
              }
            : prev
        );
        return;
      }

      if (event.type === 'blueprint_file_started') {
        buf.blueprintFiles.delete(event.fileId);
        setActiveSession((prev) => {
          if (!prev || prev.id !== sessionId || !prev.blueprint) return prev;
          return {
            ...prev,
            blueprint: {
              ...prev.blueprint,
              files: prev.blueprint.files.map((f) =>
                f.id === event.fileId
                  ? { ...f, status: 'running', content: '', error: undefined, startedAt: Date.now() }
                  : f
              ),
            },
          };
        });
        return;
      }

      if (event.type === 'blueprint_file_completed') {
        buf.blueprintFiles.delete(event.file.id);
        setActiveSession((prev) => {
          if (!prev || prev.id !== sessionId || !prev.blueprint) return prev;
          return {
            ...prev,
            blueprint: {
              ...prev.blueprint,
              files: prev.blueprint.files.map((f) =>
                f.id === event.file.id ? event.file : f
              ),
            },
          };
        });
        return;
      }

      if (event.type === 'blueprint_completed') {
        setActiveRun(false);
        setActiveSession((prev) =>
          prev && prev.id === sessionId && prev.blueprint
            ? {
                ...prev,
                blueprint: { ...prev.blueprint, finishedAt: event.finishedAt },
              }
            : prev
        );
        void loadSessionsList();
        void loadProviders(false);
        return;
      }

      if (event.type === 'blueprint_audit_completed') {
        setActiveSession((prev) =>
          prev && prev.id === sessionId && prev.blueprint
            ? {
                ...prev,
                blueprint: { ...prev.blueprint, audit: event.audit },
              }
            : prev
        );
        return;
      }

      if (event.type === 'run_aborted') {
        setActiveRun(false);
        setAutopilotStage('');
      }
    });

    return () => {
      window.clearInterval(flushTimer);
      unsubscribe();
    };
  }, [activeSession?.id, loadSessionsList]);

  const handleSelectSession = async (id: string) => {
    const data = await fetchSession(id);
    setActiveSession(data.session);
    setActiveRun(data.activeRun);
    setAutopilotStage('');
    if (data.session.blueprint?.files.length) setActiveStage('blueprint');
    else if (data.session.synthesis?.content) setActiveStage('synthesis');
    else setActiveStage('debate');
  };

  const handleDeleteSession = async (id: string) => {
    await removeSession(id);
    if (activeSession?.id === id) {
      setActiveSession(null);
      setActiveRun(false);
      setAutopilotStage('');
    }
    await loadSessionsList();
  };

  const handleStartNewDebate = async (payload: {
    title: string;
    idea: string;
    domain: DomainMode;
    caliber?: CaliberPreference;
    constraints: string;
    contextText: string;
    repoMeta?: RepoSnapshotMeta;
    seats: SeatConfig[];
    autoPilot: boolean;
  }) => {
    setSubmitting(true);
    try {
      const created = await createSession({
        title: payload.title,
        idea: payload.idea,
        domain: payload.domain,
        language: lang,
        caliber: payload.caliber,
        constraints: payload.constraints,
        contextText: payload.contextText,
        repoMeta: payload.repoMeta,
        seats: payload.seats,
      });
      setActiveSession(created);
      setActiveStage('debate');
      setActiveRun(true);

      if (payload.autoPilot) {
        const judge = pickDefaultJudge(providers, payload.seats);
        setAutopilotStage('Oto-Pilot başlatılıyor...');
        await triggerAutoPilot(created.id, { seats: payload.seats, judge });
      } else {
        await triggerRound(created.id, undefined, payload.seats);
      }
      await loadSessionsList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextRound = async (guidance: string, seats: SeatConfig[]) => {
    if (!activeSession) return;
    setActiveRun(true);
    try {
      await triggerRound(activeSession.id, guidance, seats);
    } catch (err) {
      setActiveRun(false);
      throw err;
    }
  };

  const handleSynthesis = async (judge: {
    provider: ProviderId;
    model: string;
  }) => {
    if (!activeSession) return;
    setActiveRun(true);
    try {
      await triggerSynthesis(activeSession.id, judge);
    } catch (err) {
      setActiveRun(false);
      throw err;
    }
  };

  const handleUpdateDecisionGates = (gates: DecisionGate[]) => {
    if (!activeSession?.synthesis) return;
    setActiveSession({
      ...activeSession,
      synthesis: { ...activeSession.synthesis, decisionGates: gates },
    });
    void saveDecisionGates(activeSession.id, gates);
  };

  const handleExtractGates = async () => {
    if (!activeSession) return;
    setExtractingGates(true);
    try {
      const agy = providers.find((p) => p.id === 'antigravity' && p.installed);
      const extractor = agy
        ? {
            provider: 'antigravity' as ProviderId,
            model:
              agy.models.find((m) => m.id === 'gemini-3.8-flash-low')?.id ||
              agy.models[1]?.id ||
              'auto',
          }
        : pickDefaultJudge(providers, activeSession.seats);
      const updated = await extractSessionDecisionGates(
        activeSession.id,
        extractor
      );
      setActiveSession((prev) => (prev ? { ...prev, synthesis: updated } : prev));
    } finally {
      setExtractingGates(false);
    }
  };

  const handleGenerateBlueprint = async (options: {
    provider: ProviderId;
    model: string;
    depth: BlueprintDepth;
    files: BlueprintFileSpec[];
  }) => {
    if (!activeSession) return;
    setActiveRun(true);
    try {
      await triggerBlueprintGeneration(activeSession.id, options);
    } catch (err) {
      setActiveRun(false);
      throw err;
    }
  };

  const handleRegenerateBlueprintFile = async (
    fileId: string,
    options: {
      provider: ProviderId;
      model: string;
      depth: BlueprintDepth;
      revisionNote?: string;
    }
  ) => {
    if (!activeSession) return;
    setActiveRun(true);
    try {
      await triggerRegenerateFile(activeSession.id, fileId, options);
    } catch (err) {
      setActiveRun(false);
      throw err;
    }
  };

  const handleRetryFailedBlueprint = async (options?: {
    depth?: BlueprintDepth;
    provider?: ProviderId;
    model?: string;
  }) => {
    if (!activeSession) return;
    setActiveRun(true);
    try {
      await triggerRetryFailedBlueprint(activeSession.id, options);
    } catch (err) {
      setActiveRun(false);
      throw err;
    }
  };

  const handleRunAudit = async (auditor: {
    provider: ProviderId;
    model: string;
  }) => {
    if (!activeSession) return;
    const audit = await triggerBlueprintAudit(activeSession.id, auditor);
    setActiveSession((prev) =>
      prev && prev.blueprint
        ? { ...prev, blueprint: { ...prev.blueprint, audit } }
        : prev
    );
  };

  const handleFixAuditIssues = async (options: {
    issueIds: string[];
    provider: ProviderId;
    model: string;
  }) => {
    if (!activeSession) return;
    setActiveRun(true);
    try {
      await triggerBlueprintFix(activeSession.id, options);
    } catch (err) {
      setActiveRun(false);
      throw err;
    }
  };

  const handleBlueprintFileUpdated = (file: GeneratedMdFile) => {
    setActiveSession((prev) => {
      if (!prev || !prev.blueprint) return prev;
      return {
        ...prev,
        blueprint: {
          ...prev.blueprint,
          files: prev.blueprint.files.map((f) => (f.id === file.id ? file : f)),
        },
      };
    });
  };

  const handleAbort = async () => {
    if (!activeSession) return;
    await abortRun(activeSession.id);
    setActiveRun(false);
    setAutopilotStage('');
  };

  const handleActiveSeatsChange = (seats: SeatConfig[]) => {
    if (!activeSession) return;
    setActiveSession({ ...activeSession, seats });
    void updateSessionSeats(activeSession.id, seats);
  };

  const handleRedTeam = async (seatId?: string) => {
    if (!activeSession) return;
    setActiveRun(true);
    try {
      await triggerRedTeam(activeSession.id, seatId);
    } catch (err) {
      setActiveRun(false);
      throw err;
    }
  };

  const handleTargetedChallenge = async (question: string, targetSeatId?: string) => {
    if (!activeSession) return;
    setActiveRun(true);
    try {
      await triggerTargetedChallenge(activeSession.id, question, targetSeatId);
    } catch (err) {
      setActiveRun(false);
      throw err;
    }
  };

  const handleForkSession = async (options: {
    forkLabel?: string;
    extraConstraint?: string;
  }) => {
    if (!activeSession) return;
    const forked = await triggerForkSession(activeSession.id, options);
    setActiveSession(forked);
    setActiveStage('debate');
    await loadSessionsList();
  };

  const handleRunLint = async () => {
    if (!activeSession) return;
    const lint = await triggerBlueprintLint(activeSession.id);
    setActiveSession((prev) =>
      prev && prev.id === activeSession.id && prev.blueprint
        ? { ...prev, blueprint: { ...prev.blueprint, lint } }
        : prev
    );
  };

  const installedCount = providers.filter((p) => p.installed).length;

  return (
    <div className="conceptus-bg flex h-screen w-screen overflow-hidden text-[#f7f8f8]">
      {leftOpen && (
        <LeftRail
          sessions={sessions}
          activeSession={activeSession}
          onSelectSession={(id) => void handleSelectSession(id)}
          onNewSession={() => {
            setActiveSession(null);
            setActiveRun(false);
            setAutopilotStage('');
            setActiveStage('debate');
          }}
          onDeleteSession={(id) => void handleDeleteSession(id)}
          onCollapse={() => setLeftOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar
          activeSession={activeSession}
          activeStage={activeStage}
          onSelectStage={setActiveStage}
          uiMode={uiMode}
          onUiModeChange={handleUiModeChange}
          leftOpen={leftOpen}
          onToggleLeft={() => setLeftOpen((v) => !v)}
          rightOpen={rightOpen}
          onToggleRight={() => setRightOpen((v) => !v)}
          installedCount={installedCount}
          totalProviders={providers.length}
        />

        <div className="flex-1 flex min-h-0 overflow-hidden gap-3">
          <div
            className={`flex-1 flex flex-col min-w-0 my-3 ml-3 mr-3 ${
              rightOpen ? 'lg:mr-0' : ''
            } rounded-2xl border border-white/[0.07] bg-[#0b0c10]/70 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden`}
          >
            {activeSession ? (
              <DebateStage
                session={activeSession}
                providers={providers}
                cooldowns={cooldowns}
                fallbackPolicy={fallbackPolicy}
                uiMode={uiMode}
                activeRun={activeRun}
                autopilotStage={autopilotStage}
                activeStage={activeStage}
                onSelectStage={setActiveStage}
                onStartNextRound={handleNextRound}
                onStartRedTeam={handleRedTeam}
                onStartChallenge={handleTargetedChallenge}
                onForkSession={handleForkSession}
                onStartSynthesis={handleSynthesis}
                onUpdateDecisionGates={handleUpdateDecisionGates}
                onExtractGates={handleExtractGates}
                extractingGates={extractingGates}
                onGenerateBlueprint={handleGenerateBlueprint}
                onRegenerateBlueprintFile={handleRegenerateBlueprintFile}
                onRetryFailedBlueprint={handleRetryFailedBlueprint}
                onRunLint={handleRunLint}
                onRunAudit={handleRunAudit}
                onFixAuditIssues={handleFixAuditIssues}
                onBlueprintFileUpdated={handleBlueprintFileUpdated}
                onAbort={handleAbort}
                onSeatsChange={handleActiveSeatsChange}
              />
            ) : (
              <SetupStage
                providers={providers}
                loadingProviders={loadingProviders}
                onRefreshProviders={() => void loadProviders(true)}
                uiMode={uiMode}
                seats={draftSeats}
                onSeatsChange={setDraftSeats}
                onApplySimplePreset={handleApplySimplePreset}
                activePreset={activePreset}
                onStartDebate={handleStartNewDebate}
                submitting={submitting}
              />
            )}
          </div>

          {rightOpen && (
            <RightToolsBox
              providers={providers}
              cooldowns={cooldowns}
              fallbackPolicy={fallbackPolicy}
              onUpdateFallbackPolicy={handleUpdateFallbackPolicy}
              onResetCooldowns={handleResetCooldowns}
              loadingProviders={loadingProviders}
              onRefreshProviders={() => void loadProviders(true)}
              activeSession={activeSession}
              draftSeats={draftSeats}
              onSelectStage={setActiveStage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
