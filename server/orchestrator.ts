import type { Response as ExpressResponse } from 'express';
import { runCliSeatWithFallback, type JobType } from './fallback.ts';
import {
  buildBlueprintAuditPrompt,
  buildBlueprintFilePrompt,
  buildBlueprintFixPrompt,
  buildBlueprintPlannerPrompt,
  buildCrossDebatePrompt,
  buildExtractGatesPrompt,
  buildIdeaClarifierPrompt,
  buildMasterSynthesisPrompt,
  buildRound1Prompt,
} from './prompts.ts';
import { loadSession, saveSession } from './storage.ts';
import type {
  BlueprintAudit,
  BlueprintAuditIssue,
  BlueprintDepth,
  BlueprintFileSpec,
  BlueprintPack,
  ClarifyQuestion,
  DebateRound,
  DebateSession,
  DecisionGate,
  DomainMode,
  EffortLevel,
  GeneratedMdFile,
  ProviderId,
  SeatConfig,
  SeatResponse,
  StreamEvent,
  SynthesisResult,
} from './types.ts';

interface ActiveRun {
  controller: AbortController;
  startedAt: number;
}

const activeRuns = new Map<string, ActiveRun>();
const sseClients = new Map<string, Set<ExpressResponse>>();

export function isSessionRunning(sessionId: string): boolean {
  return activeRuns.has(sessionId);
}

export function subscribeSessionEvents(sessionId: string, res: ExpressResponse) {
  let set = sseClients.get(sessionId);
  if (!set) {
    set = new Set();
    sseClients.set(sessionId, set);
  }
  set.add(res);

  res.on('close', () => {
    set?.delete(res);
    if (set && set.size === 0) {
      sseClients.delete(sessionId);
    }
  });
}

function broadcast(sessionId: string, event: StreamEvent) {
  const clients = sseClients.get(sessionId);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export function abortSessionRun(sessionId: string): boolean {
  const run = activeRuns.get(sessionId);
  if (!run) return false;
  run.controller.abort();
  activeRuns.delete(sessionId);
  broadcast(sessionId, { type: 'run_aborted' });
  return true;
}

function classifyBlueprintJobType(filename: string, depth: BlueprintDepth): JobType {
  if (depth === 'deep') return 'blueprint_deep';
  if (/VISION|UX|DESIGN|SCREEN|ARCHITECTURE|DATA|SECURITY|SPEC|DECISION/i.test(filename)) {
    return 'blueprint_core';
  }
  return 'blueprint_standard';
}

function getAnonymousLabel(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return `Ajan ${letter}`;
}

function sanitizeGates(rawGates: any): DecisionGate[] {
  if (!Array.isArray(rawGates)) return [];
  return rawGates
    .slice(0, 5)
    .filter((g) => g && g.question && Array.isArray(g.options) && g.options.length >= 2)
    .map((g, idx) => {
      const options = g.options.slice(0, 4).map((o: any, oIdx: number) => ({
        id: String(o.id || String.fromCharCode(65 + oIdx)),
        label: String(o.label || `Seçenek ${oIdx + 1}`).trim(),
        tradeoff: String(o.tradeoff || '').trim(),
      }));
      const rec = String(g.recommendation || options[0]?.id || 'A');
      return {
        id: String(g.id || `gate_${idx + 1}`),
        question: String(g.question).trim(),
        recommendation: rec,
        options,
        selectedOptionId: rec,
      };
    });
}

function parseSynthesisMeta(rawContent: string): {
  cleanMarkdown: string;
  evolutionHighlights?: string[];
  decisionGates?: DecisionGate[];
} {
  const fenceRegex = /```conceptus-meta\s*\r?\n([\s\S]*?)\r?\n```\s*$/i;
  const match = rawContent.match(fenceRegex);
  if (!match) {
    return { cleanMarkdown: rawContent.trim() };
  }

  const cleanMarkdown = rawContent.slice(0, match.index).trim();
  try {
    const parsed = JSON.parse(match[1].trim());
    const evolutionHighlights = Array.isArray(parsed?.evolutionHighlights)
      ? parsed.evolutionHighlights.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 5)
      : undefined;
    const decisionGates = sanitizeGates(parsed?.decisionGates);
    return {
      cleanMarkdown,
      evolutionHighlights: evolutionHighlights?.length ? evolutionHighlights : undefined,
      decisionGates: decisionGates.length ? decisionGates : undefined,
    };
  } catch {
    return { cleanMarkdown };
  }
}

async function executeRoundInternal(
  sessionId: string,
  session: DebateSession,
  controller: AbortController,
  userGuidance?: string
): Promise<DebateRound> {
  const enabledSeats = session.seats.filter((s) => s.enabled);
  if (enabledSeats.length === 0) {
    throw new Error('En az 1 aktif ajan koltuğu seçmelisin.');
  }

  const roundNumber = session.rounds.length + 1;
  const kind: DebateRound['kind'] =
    roundNumber === 1
      ? 'blind_analysis'
      : roundNumber === 2
        ? 'cross_critique'
        : 'evolution';

  const title =
    roundNumber === 1
      ? 'Bağımsız Fikirler'
      : roundNumber === 2
        ? 'Çapraz Tartışma'
        : `İleri Evrim (v${roundNumber})`;

  const previousRound =
    roundNumber > 1 ? session.rounds[session.rounds.length - 1] : undefined;

  const responses: SeatResponse[] = enabledSeats.map((seat, idx) => ({
    seatId: seat.id,
    seatLabel: seat.label,
    anonymousId: getAnonymousLabel(idx),
    provider: seat.provider,
    model: seat.model,
    role: seat.role,
    customRoleTitle: seat.customRoleTitle,
    status: 'pending',
    content: '',
  }));

  const round: DebateRound = {
    roundNumber,
    kind,
    title,
    userGuidance: userGuidance?.trim() || undefined,
    startedAt: Date.now(),
    responses,
  };

  session.rounds.push(round);
  saveSession(session);
  broadcast(sessionId, { type: 'round_started', round });

  await Promise.all(
    enabledSeats.map(async (seat, idx) => {
      const seatResp = round.responses[idx];
      seatResp.status = 'running';
      seatResp.startedAt = Date.now();
      broadcast(sessionId, {
        type: 'seat_started',
        roundNumber,
        seatId: seat.id,
      });

      const prompt =
        roundNumber === 1 || !previousRound
          ? buildRound1Prompt(session, seat)
          : buildCrossDebatePrompt(
              session,
              seat,
              previousRound,
              roundNumber,
              userGuidance
            );

      try {
        const result = await runCliSeatWithFallback({
          provider: seat.provider,
          model: seat.model,
          effort: seat.effort,
          tier: seat.economyMode ? 'concise' : 'standard',
          jobType: 'debate',
          prompt,
          signal: controller.signal,
          onFallback: (notice) => {
            seatResp.provider = notice.toProvider;
            seatResp.model = notice.toModel;
            seatResp.fallbackFrom = `${notice.fromProvider}/${notice.fromModel}`;
            seatResp.content = '';
            broadcast(sessionId, {
              type: 'seat_completed',
              roundNumber,
              response: { ...seatResp, status: 'running' },
            });
          },
          onDelta: (chunk) => {
            seatResp.content += chunk;
            broadcast(sessionId, {
              type: 'seat_delta',
              roundNumber,
              seatId: seat.id,
              delta: chunk,
            });
          },
        });

        seatResp.provider = result.usedProvider;
        seatResp.model = result.usedModel;
        if (result.fallbackNotice) {
          seatResp.fallbackFrom = `${result.fallbackNotice.fromProvider}/${result.fallbackNotice.fromModel}`;
        }
        seatResp.content = result.content;
        seatResp.status = 'done';
        seatResp.finishedAt = Date.now();
        seatResp.durationMs = result.durationMs;
        seatResp.usage = result.usage;
      } catch (err: any) {
        const msg = err?.message || String(err);
        seatResp.finishedAt = Date.now();
        seatResp.durationMs = seatResp.startedAt
          ? seatResp.finishedAt - seatResp.startedAt
          : undefined;
        if (msg === 'ABORTED' || controller.signal.aborted) {
          seatResp.status = 'aborted';
          seatResp.error = 'Kullanıcı tarafından durduruldu.';
        } else {
          seatResp.status = 'error';
          seatResp.error = msg;
        }
      }

      saveSession(session);
      broadcast(sessionId, {
        type: 'seat_completed',
        roundNumber,
        response: seatResp,
      });
    })
  );

  round.finishedAt = Date.now();
  saveSession(session);
  broadcast(sessionId, {
    type: 'round_completed',
    roundNumber,
    finishedAt: round.finishedAt,
  });

  return round;
}

async function executeSynthesisInternal(
  sessionId: string,
  session: DebateSession,
  controller: AbortController,
  judge: {
    seatId?: string;
    provider: ProviderId;
    model: string;
    effort?: EffortLevel;
  }
): Promise<SynthesisResult> {
  const synthesis: SynthesisResult = {
    seatId: judge.seatId || 'judge',
    provider: judge.provider,
    model: judge.model,
    status: 'running',
    content: '',
    startedAt: Date.now(),
  };

  session.synthesis = synthesis;
  saveSession(session);
  broadcast(sessionId, { type: 'synthesis_started', synthesis });

  try {
    const prompt = buildMasterSynthesisPrompt(session);
    const result = await runCliSeatWithFallback({
      provider: judge.provider,
      model: judge.model,
      effort: judge.effort || 'default',
      tier: 'deep',
      jobType: 'synthesis',
      prompt,
      signal: controller.signal,
      onFallback: (notice) => {
        synthesis.provider = notice.toProvider;
        synthesis.model = notice.toModel;
        synthesis.fallbackFrom = `${notice.fromProvider}/${notice.fromModel}`;
        synthesis.content = '';
        broadcast(sessionId, { type: 'synthesis_started', synthesis });
      },
      onDelta: (chunk) => {
        synthesis.content += chunk;
        broadcast(sessionId, { type: 'synthesis_delta', delta: chunk });
      },
    });

    const parsed = parseSynthesisMeta(result.content);
    synthesis.provider = result.usedProvider;
    synthesis.model = result.usedModel;
    if (result.fallbackNotice) {
      synthesis.fallbackFrom = `${result.fallbackNotice.fromProvider}/${result.fallbackNotice.fromModel}`;
    }
    synthesis.content = parsed.cleanMarkdown;
    synthesis.evolutionHighlights = parsed.evolutionHighlights;
    synthesis.decisionGates = parsed.decisionGates;
    synthesis.status = 'done';
    synthesis.finishedAt = Date.now();
    synthesis.durationMs = result.durationMs;
  } catch (err: any) {
    const msg = err?.message || String(err);
    synthesis.finishedAt = Date.now();
    synthesis.durationMs = synthesis.finishedAt - synthesis.startedAt;
    if (msg === 'ABORTED' || controller.signal.aborted) {
      synthesis.status = 'aborted';
      synthesis.error = 'Kullanıcı tarafından durduruldu.';
    } else {
      synthesis.status = 'error';
      synthesis.error = msg;
    }
  } finally {
    saveSession(session);
    broadcast(sessionId, { type: 'synthesis_completed', synthesis });
  }

  return synthesis;
}

export async function startNextRound(
  sessionId: string,
  userGuidance?: string,
  updatedSeats?: SeatConfig[]
): Promise<{ started: true }> {
  if (activeRuns.has(sessionId)) {
    throw new Error('Bu oturumda zaten devam eden bir işlem var.');
  }

  const session = loadSession(sessionId);
  if (!session) throw new Error('Oturum bulunamadı.');

  if (updatedSeats && updatedSeats.length > 0) {
    session.seats = updatedSeats;
    saveSession(session);
  }

  if (session.seats.filter((s) => s.enabled).length === 0) {
    throw new Error('En az 1 aktif ajan koltuğu seçmelisin.');
  }

  const controller = new AbortController();
  activeRuns.set(sessionId, { controller, startedAt: Date.now() });

  void (async () => {
    try {
      await executeRoundInternal(sessionId, session, controller, userGuidance);
    } catch (err: any) {
      broadcast(sessionId, {
        type: 'error',
        message: err?.message || 'Tur yürütülürken hata oluştu.',
      });
    } finally {
      activeRuns.delete(sessionId);
    }
  })();

  return { started: true };
}

export async function startAutoPilot(
  sessionId: string,
  options: {
    seats?: SeatConfig[];
    judge: { provider: ProviderId; model: string; effort?: EffortLevel };
  }
): Promise<{ started: true }> {
  if (activeRuns.has(sessionId)) {
    throw new Error('Bu oturumda zaten devam eden bir işlem var.');
  }

  const session = loadSession(sessionId);
  if (!session) throw new Error('Oturum bulunamadı.');

  if (options.seats && options.seats.length > 0) {
    session.seats = options.seats;
    saveSession(session);
  }

  if (session.seats.filter((s) => s.enabled).length === 0) {
    throw new Error('Oto-Pilot için en az 1 aktif ajan koltuğu seçmelisin.');
  }

  const controller = new AbortController();
  activeRuns.set(sessionId, { controller, startedAt: Date.now() });

  void (async () => {
    try {
      // Stage 1: Round 1 (Blind)
      if (session.rounds.length === 0 && !controller.signal.aborted) {
        broadcast(sessionId, {
          type: 'autopilot_stage',
          stage: 'Oto-Pilot 1/3 · Bağımsız fikirler toplanıyor...',
        });
        await executeRoundInternal(sessionId, session, controller);
      }

      // Stage 2: Round 2 (Cross Debate)
      if (session.rounds.length === 1 && !controller.signal.aborted) {
        broadcast(sessionId, {
          type: 'autopilot_stage',
          stage: 'Oto-Pilot 2/3 · Ajanlar fikirleri çarpıştırıyor...',
        });
        await executeRoundInternal(sessionId, session, controller);
      }

      // Stage 3: Master Decision
      if (!controller.signal.aborted) {
        broadcast(sessionId, {
          type: 'autopilot_stage',
          stage: 'Oto-Pilot 3/3 · Master Karar sentezleniyor...',
        });
        await executeSynthesisInternal(sessionId, session, controller, options.judge);
      }

      broadcast(sessionId, { type: 'autopilot_stage', stage: '' });
    } catch (err: any) {
      broadcast(sessionId, {
        type: 'error',
        message: err?.message || 'Oto-Pilot sırasında hata oluştu.',
      });
    } finally {
      activeRuns.delete(sessionId);
    }
  })();

  return { started: true };
}

export async function startMasterSynthesis(
  sessionId: string,
  judge: {
    seatId?: string;
    provider: ProviderId;
    model: string;
    effort?: EffortLevel;
  }
): Promise<{ started: true }> {
  if (activeRuns.has(sessionId)) {
    throw new Error('Bu oturumda zaten devam eden bir işlem var.');
  }

  const session = loadSession(sessionId);
  if (!session) throw new Error('Oturum bulunamadı.');
  if (session.rounds.length === 0) {
    throw new Error('Master Karar için önce en az 1 tartışma turu tamamlanmalı.');
  }

  const controller = new AbortController();
  activeRuns.set(sessionId, { controller, startedAt: Date.now() });

  void (async () => {
    try {
      await executeSynthesisInternal(sessionId, session, controller, judge);
    } catch (err: any) {
      broadcast(sessionId, {
        type: 'error',
        message: err?.message || 'Master Karar sırasında hata oluştu.',
      });
    } finally {
      activeRuns.delete(sessionId);
    }
  })();

  return { started: true };
}

export async function clarifyRawIdea(options: {
  idea: string;
  domain: DomainMode;
  language?: 'tr' | 'en';
  provider: ProviderId;
  model: string;
}): Promise<{ questions: ClarifyQuestion[]; durationMs: number }> {
  const prompt = buildIdeaClarifierPrompt(
    options.idea,
    options.domain,
    options.language || 'tr'
  );
  const ctrl = new AbortController();
  const res = await runCliSeatWithFallback({
    provider: options.provider,
    model: options.model,
    effort: 'low',
    tier: 'concise',
    prompt,
    signal: ctrl.signal,
    onDelta: () => {},
  });

  const match = res.content.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error('Netleştirme soruları çıkarılamadı.');
  }
  const raw = JSON.parse(match[0]);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Boş soru listesi döndü.');
  }

  const questions: ClarifyQuestion[] = raw
    .slice(0, 4)
    .filter((q: any) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
    .map((q: any, idx: number) => ({
      id: String(q.id || `q_${idx + 1}`),
      question: String(q.question).trim(),
      options: q.options.slice(0, 4).map((o: any, oIdx: number) => ({
        id: String(o.id || String.fromCharCode(65 + oIdx)),
        label: String(o.label || o).trim(),
      })),
    }));

  if (questions.length === 0) {
    throw new Error('Geçerli netleştirme sorusu üretilemedi.');
  }

  return { questions, durationMs: res.durationMs };
}

export async function extractDecisionGates(
  sessionId: string,
  extractor: { provider: ProviderId; model: string }
): Promise<SynthesisResult> {
  const session = loadSession(sessionId);
  if (!session || !session.synthesis?.content) {
    throw new Error('Önce Master Karar oluşturulmalıdır.');
  }

  const prompt = buildExtractGatesPrompt(session);
  const ctrl = new AbortController();
  const res = await runCliSeatWithFallback({
    provider: extractor.provider,
    model: extractor.model,
    effort: 'low',
    tier: 'concise',
    prompt,
    signal: ctrl.signal,
    onDelta: () => {},
  });

  const jsonMatch = res.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Karar kapıları çıkarılamadı.');
  const parsed = JSON.parse(jsonMatch[0]);

  if (Array.isArray(parsed?.evolutionHighlights)) {
    session.synthesis.evolutionHighlights = parsed.evolutionHighlights
      .map((x: any) => String(x).trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  const gates = sanitizeGates(parsed?.decisionGates);
  if (gates.length > 0) {
    session.synthesis.decisionGates = gates;
  }

  saveSession(session);
  return session.synthesis;
}

function sanitizeMdFilename(raw: string): string {
  let clean = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!clean) clean = 'DOCUMENT.md';
  if (!clean.toLowerCase().endsWith('.md')) clean += '.md';
  return clean;
}

function stripOuterFence(md: string): string {
  const trimmed = md.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\r?\n([\s\S]*?)\r?\n```$/i);
  return match ? match[1].trim() : trimmed;
}

export async function suggestBlueprintPlan(
  sessionId: string,
  planner: { provider: ProviderId; model: string }
): Promise<BlueprintFileSpec[]> {
  const session = loadSession(sessionId);
  if (!session) throw new Error('Oturum bulunamadı.');
  if (session.rounds.length === 0 && !session.synthesis) {
    throw new Error('Öneri için önce tartışma veya Master Karar üretilmelidir.');
  }

  const prompt = buildBlueprintPlannerPrompt(session);
  const controller = new AbortController();
  const res = await runCliSeatWithFallback({
    provider: planner.provider,
    model: planner.model,
    effort: 'low',
    tier: 'concise',
    prompt,
    signal: controller.signal,
    onDelta: () => {},
  });

  const text = res.content.trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Model geçerli bir dosya listesi JSON döndüremedi.');
  }

  const rawList = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error('Boş dosya listesi döndü.');
  }

  return rawList.slice(0, 8).map((item: any, idx: number) => ({
    id: `md_ai_${Date.now().toString(36)}_${idx}`,
    filename: sanitizeMdFilename(String(item.filename || `DOC_${idx + 1}.md`)),
    title: String(item.title || item.filename || `Doküman ${idx + 1}`).trim(),
    purpose: String(item.purpose || 'Master Karar doğrultusunda doküman.').trim(),
    selected: true,
  }));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

export async function startBlueprintGeneration(
  sessionId: string,
  options: {
    provider: ProviderId;
    model: string;
    effort?: EffortLevel;
    depth?: BlueprintDepth;
    files: BlueprintFileSpec[];
  }
): Promise<BlueprintPack> {
  if (activeRuns.has(sessionId)) {
    throw new Error('Bu oturumda zaten devam eden bir işlem var.');
  }

  const session = loadSession(sessionId);
  if (!session) throw new Error('Oturum bulunamadı.');

  const selected = options.files.filter((f) => f.selected);
  if (selected.length === 0) {
    throw new Error('Üretmek için en az 1 Markdown dosyası seçmelisin.');
  }

  const depth: BlueprintDepth = options.depth || 'concise';
  const effectiveEffort: EffortLevel =
    options.effort ||
    (depth === 'concise' ? 'low' : depth === 'standard' ? 'medium' : 'high');

  const normalizedSpecs: BlueprintFileSpec[] = selected.map((f, i) => ({
    ...f,
    id: f.id || `md_${i}_${Date.now().toString(36)}`,
    filename: sanitizeMdFilename(f.filename),
  }));

  const files: GeneratedMdFile[] = normalizedSpecs.map((spec) => ({
    id: spec.id,
    filename: spec.filename,
    title: spec.title,
    purpose: spec.purpose,
    status: 'pending',
    content: '',
    provider: spec.assignedProvider || options.provider,
    model: spec.assignedModel || options.model,
  }));

  const pack: BlueprintPack = {
    provider: options.provider,
    model: options.model,
    depth,
    startedAt: Date.now(),
    files,
  };

  session.blueprint = pack;
  saveSession(session);

  const controller = new AbortController();
  activeRuns.set(sessionId, { controller, startedAt: Date.now() });
  broadcast(sessionId, { type: 'blueprint_started', blueprint: pack });

  void (async () => {
    try {
      // Full single-wave parallel execution (up to 6 files simultaneously)
      await runWithConcurrency(normalizedSpecs, 6, async (spec) => {
        if (controller.signal.aborted) return;
        const target = pack.files.find((f) => f.id === spec.id);
        if (!target) return;

        target.status = 'running';
        target.startedAt = Date.now();
        broadcast(sessionId, { type: 'blueprint_file_started', fileId: target.id });

        const prompt = buildBlueprintFilePrompt(session, spec, normalizedSpecs, depth);
        try {
          const result = await runCliSeatWithFallback({
            provider: target.provider,
            model: target.model,
            effort: effectiveEffort,
            tier: depth,
            jobType: classifyBlueprintJobType(target.filename, depth),
            prompt,
            signal: controller.signal,
            onFallback: (notice) => {
              target.provider = notice.toProvider;
              target.model = notice.toModel;
              target.fallbackFrom = `${notice.fromProvider}/${notice.fromModel}`;
              target.content = '';
              broadcast(sessionId, {
                type: 'blueprint_file_completed',
                file: { ...target, status: 'running' },
              });
            },
            onDelta: (chunk) => {
              target.content += chunk;
              broadcast(sessionId, {
                type: 'blueprint_file_delta',
                fileId: target.id,
                delta: chunk,
              });
            },
          });

          target.provider = result.usedProvider;
          target.model = result.usedModel;
          if (result.fallbackNotice) {
            target.fallbackFrom = `${result.fallbackNotice.fromProvider}/${result.fallbackNotice.fromModel}`;
          }
          target.content = stripOuterFence(result.content);
          target.status = 'done';
          target.finishedAt = Date.now();
          target.durationMs = result.durationMs;
        } catch (err: any) {
          const msg = err?.message || String(err);
          target.finishedAt = Date.now();
          target.durationMs = target.startedAt
            ? target.finishedAt - target.startedAt
            : undefined;
          if (msg === 'ABORTED' || controller.signal.aborted) {
            target.status = 'aborted';
            target.error = 'Kullanıcı tarafından durduruldu.';
          } else {
            target.status = 'error';
            target.error = msg;
          }
        }

        saveSession(session);
        broadcast(sessionId, { type: 'blueprint_file_completed', file: target });
      });

      pack.finishedAt = Date.now();
      saveSession(session);
      broadcast(sessionId, {
        type: 'blueprint_completed',
        finishedAt: pack.finishedAt,
      });
    } catch (err: any) {
      broadcast(sessionId, {
        type: 'error',
        message: err?.message || 'MD paketi üretilirken hata oluştu.',
      });
    } finally {
      activeRuns.delete(sessionId);
    }
  })();

  return pack;
}

export async function regenerateBlueprintFile(
  sessionId: string,
  fileId: string,
  options: {
    provider: ProviderId;
    model: string;
    effort?: EffortLevel;
    depth?: BlueprintDepth;
    revisionNote?: string;
  }
): Promise<GeneratedMdFile> {
  if (activeRuns.has(sessionId)) {
    throw new Error('Bu oturumda zaten devam eden bir işlem var.');
  }

  const session = loadSession(sessionId);
  if (!session || !session.blueprint) {
    throw new Error('MD paketi bulunamadı.');
  }

  const target = session.blueprint.files.find((f) => f.id === fileId);
  if (!target) throw new Error('Dosya bulunamadı.');

  const allSpecs: BlueprintFileSpec[] = session.blueprint.files.map((f) => ({
    id: f.id,
    filename: f.filename,
    title: f.title,
    purpose: f.purpose,
    selected: true,
  }));
  const targetSpec = allSpecs.find((s) => s.id === fileId)!;
  const depth = options.depth || session.blueprint.depth || 'concise';
  const previousContent = target.content;

  target.status = 'running';
  target.content = '';
  target.error = undefined;
  target.provider = options.provider;
  target.model = options.model;
  target.startedAt = Date.now();
  target.finishedAt = undefined;
  target.durationMs = undefined;
  saveSession(session);

  const controller = new AbortController();
  activeRuns.set(sessionId, { controller, startedAt: Date.now() });
  broadcast(sessionId, { type: 'blueprint_file_started', fileId: target.id });

  void (async () => {
    try {
      const prompt = buildBlueprintFilePrompt(
        session,
        targetSpec,
        allSpecs,
        depth,
        options.revisionNote?.trim()
          ? { note: options.revisionNote.trim(), previousContent }
          : undefined
      );
      const result = await runCliSeatWithFallback({
        provider: options.provider,
        model: options.model,
        effort: options.effort || 'low',
        tier: depth,
        jobType: classifyBlueprintJobType(target.filename, depth),
        prompt,
        signal: controller.signal,
        onFallback: (notice) => {
          target.provider = notice.toProvider;
          target.model = notice.toModel;
          target.fallbackFrom = `${notice.fromProvider}/${notice.fromModel}`;
          target.content = '';
          broadcast(sessionId, {
            type: 'blueprint_file_completed',
            file: { ...target, status: 'running' },
          });
        },
        onDelta: (chunk) => {
          target.content += chunk;
          broadcast(sessionId, {
            type: 'blueprint_file_delta',
            fileId: target.id,
            delta: chunk,
          });
        },
      });
      target.provider = result.usedProvider;
      target.model = result.usedModel;
      if (result.fallbackNotice) {
        target.fallbackFrom = `${result.fallbackNotice.fromProvider}/${result.fallbackNotice.fromModel}`;
      } else {
        target.fallbackFrom = undefined;
      }
      target.content = stripOuterFence(result.content);
      target.status = 'done';
      target.finishedAt = Date.now();
      target.durationMs = result.durationMs;
    } catch (err: any) {
      const msg = err?.message || String(err);
      target.finishedAt = Date.now();
      target.durationMs = target.startedAt ? target.finishedAt - target.startedAt : undefined;
      if (msg === 'ABORTED' || controller.signal.aborted) {
        target.status = 'aborted';
        target.error = 'Kullanıcı tarafından durduruldu.';
      } else {
        target.status = 'error';
        target.error = msg;
      }
    } finally {
      saveSession(session);
      activeRuns.delete(sessionId);
      broadcast(sessionId, { type: 'blueprint_file_completed', file: target });
      broadcast(sessionId, { type: 'blueprint_completed', finishedAt: Date.now() });
    }
  })();

  return target;
}

export async function runBlueprintAudit(
  sessionId: string,
  auditor: { provider: ProviderId; model: string }
): Promise<BlueprintAudit> {
  const session = loadSession(sessionId);
  if (!session || !session.blueprint) {
    throw new Error('Denetlenecek MD paketi bulunamadı.');
  }

  const prompt = buildBlueprintAuditPrompt(session);
  const ctrl = new AbortController();
  const res = await runCliSeatWithFallback({
    provider: auditor.provider,
    model: auditor.model,
    effort: 'low',
    tier: 'concise',
    prompt,
    signal: ctrl.signal,
    onDelta: () => {},
  });

  const jsonMatch = res.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Denetçi geçerli JSON raporu döndüremedi.');
  }
  const parsed = JSON.parse(jsonMatch[0]);
  const issues: BlueprintAuditIssue[] = Array.isArray(parsed?.issues)
    ? parsed.issues.slice(0, 8).map((it: any, idx: number) => ({
        id: String(it.id || `iss_${idx + 1}`),
        severity:
          it.severity === 'high' || it.severity === 'medium' || it.severity === 'low'
            ? it.severity
            : 'medium',
        file: String(it.file || '').trim(),
        conflictWith: it.conflictWith ? String(it.conflictWith).trim() : undefined,
        description: String(it.description || '').trim(),
        fixInstruction: String(it.fixInstruction || '').trim(),
        fixed: false,
      }))
    : [];

  const score = Math.max(0, Math.min(100, Number(parsed?.score ?? (issues.length === 0 ? 96 : 82))));
  const audit: BlueprintAudit = {
    score,
    summary: String(parsed?.summary || 'Denetim tamamlandı.').trim(),
    provider: res.usedProvider,
    model: res.usedModel,
    durationMs: res.durationMs,
    checkedAt: Date.now(),
    issues,
  };

  session.blueprint.audit = audit;
  saveSession(session);
  broadcast(sessionId, { type: 'blueprint_audit_completed', audit });
  return audit;
}

export async function startFixBlueprintIssues(
  sessionId: string,
  options: {
    issueIds: string[];
    provider: ProviderId;
    model: string;
  }
): Promise<{ fixingFiles: string[] }> {
  if (activeRuns.has(sessionId)) {
    throw new Error('Bu oturumda zaten devam eden bir işlem var.');
  }

  const session = loadSession(sessionId);
  if (!session || !session.blueprint || !session.blueprint.audit) {
    throw new Error('Düzeltilecek QA denetimi bulunamadı.');
  }

  const selectedIssues = session.blueprint.audit.issues.filter(
    (i) => options.issueIds.includes(i.id) && !i.fixed
  );
  if (selectedIssues.length === 0) {
    throw new Error('Düzeltilecek açık sorun bulunamadı.');
  }

  // Group issues by matching generated file
  const grouped = new Map<string, { file: GeneratedMdFile; issues: BlueprintAuditIssue[] }>();
  for (const iss of selectedIssues) {
    const file = session.blueprint.files.find(
      (f) => f.filename.toLowerCase() === iss.file.toLowerCase()
    );
    if (!file) continue;
    const entry = grouped.get(file.id);
    if (entry) entry.issues.push(iss);
    else grouped.set(file.id, { file, issues: [iss] });
  }

  if (grouped.size === 0) {
    throw new Error('Sorunlarla eşleşen MD dosyası bulunamadı.');
  }

  const controller = new AbortController();
  activeRuns.set(sessionId, { controller, startedAt: Date.now() });

  const entries = Array.from(grouped.values());

  void (async () => {
    try {
      await runWithConcurrency(entries, 4, async ({ file, issues }) => {
        if (controller.signal.aborted) return;
        const prevContent = file.content;
        file.status = 'running';
        file.content = '';
        file.startedAt = Date.now();
        broadcast(sessionId, { type: 'blueprint_file_started', fileId: file.id });

        try {
          const prompt = buildBlueprintFixPrompt(
            session,
            { ...file, content: prevContent },
            issues
          );
          const result = await runCliSeatWithFallback({
            provider: options.provider,
            model: options.model,
            effort: 'low',
            tier: 'concise',
            prompt,
            signal: controller.signal,
            onFallback: (notice) => {
              file.provider = notice.toProvider;
              file.model = notice.toModel;
              file.fallbackFrom = `${notice.fromProvider}/${notice.fromModel}`;
              file.content = '';
              broadcast(sessionId, {
                type: 'blueprint_file_completed',
                file: { ...file, status: 'running' },
              });
            },
            onDelta: (chunk) => {
              file.content += chunk;
              broadcast(sessionId, {
                type: 'blueprint_file_delta',
                fileId: file.id,
                delta: chunk,
              });
            },
          });
          file.provider = result.usedProvider;
          file.model = result.usedModel;
          if (result.fallbackNotice) {
            file.fallbackFrom = `${result.fallbackNotice.fromProvider}/${result.fallbackNotice.fromModel}`;
          }
          file.content = stripOuterFence(result.content);
          file.status = 'done';
          file.finishedAt = Date.now();
          file.durationMs = result.durationMs;
          for (const i of issues) i.fixed = true;
        } catch (err: any) {
          // Restore previous clean content on error/abort
          file.content = prevContent;
          file.status = 'done';
          file.error = err?.message || 'Düzeltme başarısız oldu.';
        }

        saveSession(session);
        broadcast(sessionId, { type: 'blueprint_file_completed', file });
      });

      if (session.blueprint?.audit) {
        const remaining = session.blueprint.audit.issues.filter((i) => !i.fixed).length;
        if (remaining === 0) {
          session.blueprint.audit.score = Math.min(99, Math.max(session.blueprint.audit.score, 96));
        }
        saveSession(session);
        broadcast(sessionId, {
          type: 'blueprint_audit_completed',
          audit: session.blueprint.audit,
        });
      }
      broadcast(sessionId, { type: 'blueprint_completed', finishedAt: Date.now() });
    } finally {
      activeRuns.delete(sessionId);
    }
  })();

  return { fixingFiles: entries.map((e) => e.file.filename) };
}

export async function retryFailedBlueprintFiles(
  sessionId: string,
  options?: { depth?: BlueprintDepth; provider?: ProviderId; model?: string }
): Promise<{ retryingFiles: string[] }> {
  if (activeRuns.has(sessionId)) {
    throw new Error('Bu oturumda zaten devam eden bir işlem var.');
  }

  const session = loadSession(sessionId);
  if (!session || !session.blueprint) {
    throw new Error('MD paketi bulunamadı.');
  }

  const failedFiles = session.blueprint.files.filter(
    (f) => f.status === 'error' || f.status === 'aborted' || !f.content.trim()
  );
  if (failedFiles.length === 0) {
    throw new Error('Tamamlanacak eksik veya hatalı MD dosyası yok.');
  }

  const depth = options?.depth || session.blueprint.depth || 'concise';
  const effectiveEffort: EffortLevel =
    depth === 'deep' ? 'high' : depth === 'standard' ? 'medium' : 'low';
  const userPickedModel = Boolean(options?.provider && options?.model);

  const allSpecs: BlueprintFileSpec[] = session.blueprint.files.map((f) => ({
    id: f.id,
    filename: f.filename,
    title: f.title,
    purpose: f.purpose,
    selected: true,
    assignedProvider: f.provider,
    assignedModel: f.model,
  }));

  const controller = new AbortController();
  activeRuns.set(sessionId, { controller, startedAt: Date.now() });

  void (async () => {
    try {
      await runWithConcurrency(failedFiles, 6, async (target) => {
        if (controller.signal.aborted) return;
        const spec = allSpecs.find((s) => s.id === target.id)!;

        const prevProvider = target.provider;
        const prevModel = target.model;
        if (userPickedModel && options?.provider && options?.model) {
          if (prevProvider !== options.provider || prevModel !== options.model) {
            target.fallbackFrom = `${prevProvider}/${prevModel}`;
          }
          target.provider = options.provider;
          target.model = options.model;
        }

        target.status = 'running';
        target.content = '';
        target.error = undefined;
        target.startedAt = Date.now();
        target.finishedAt = undefined;
        target.durationMs = undefined;
        broadcast(sessionId, { type: 'blueprint_file_started', fileId: target.id });
        if (userPickedModel) {
          broadcast(sessionId, {
            type: 'blueprint_file_completed',
            file: { ...target, status: 'running' },
          });
        }

        try {
          const prompt = buildBlueprintFilePrompt(session, spec, allSpecs, depth);
          const result = await runCliSeatWithFallback({
            provider: target.provider,
            model: target.model,
            effort: effectiveEffort,
            tier: depth,
            jobType: classifyBlueprintJobType(target.filename, depth),
            strictSelection: userPickedModel,
            prompt,
            signal: controller.signal,
            onFallback: (notice) => {
              target.provider = notice.toProvider;
              target.model = notice.toModel;
              target.fallbackFrom = `${notice.fromProvider}/${notice.fromModel}`;
              target.content = '';
              broadcast(sessionId, {
                type: 'blueprint_file_completed',
                file: { ...target, status: 'running' },
              });
            },
            onDelta: (chunk) => {
              target.content += chunk;
              broadcast(sessionId, {
                type: 'blueprint_file_delta',
                fileId: target.id,
                delta: chunk,
              });
            },
          });

          target.provider = result.usedProvider;
          target.model = result.usedModel;
          if (result.fallbackNotice) {
            target.fallbackFrom = `${result.fallbackNotice.fromProvider}/${result.fallbackNotice.fromModel}`;
          }
          target.content = stripOuterFence(result.content);
          target.status = 'done';
          target.error = undefined;
          target.finishedAt = Date.now();
          target.durationMs = result.durationMs;
        } catch (err: any) {
          const msg = err?.message || String(err);
          target.finishedAt = Date.now();
          target.durationMs = target.startedAt
            ? target.finishedAt - target.startedAt
            : undefined;
          if (msg === 'ABORTED' || controller.signal.aborted) {
            target.status = 'aborted';
            target.error = 'Kullanıcı tarafından durduruldu.';
          } else {
            target.status = 'error';
            target.error = msg;
          }
        }

        saveSession(session);
        broadcast(sessionId, { type: 'blueprint_file_completed', file: target });
      });

      if (session.blueprint) {
        session.blueprint.finishedAt = Date.now();
      }
      saveSession(session);
      broadcast(sessionId, {
        type: 'blueprint_completed',
        finishedAt: Date.now(),
      });
    } catch (err: any) {
      broadcast(sessionId, {
        type: 'error',
        message: err?.message || 'Eksik MD dosyaları tamamlanırken hata oluştu.',
      });
    } finally {
      activeRuns.delete(sessionId);
    }
  })();

  return { retryingFiles: failedFiles.map((f) => f.filename) };
}
