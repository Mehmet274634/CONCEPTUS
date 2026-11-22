import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import cors from 'cors';
import express from 'express';

const execFileAsync = promisify(execFile);
import { analyzeIdeaComplexity, estimateSessionBudget } from './complexity.ts';
import { discoverProviders, prewarmProviders } from './discovery.ts';
import {
  clearAllCooldowns,
  getFallbackPolicy,
  listActiveCooldowns,
  reloadFallbackStateFromDisk,
  setFallbackPolicy,
} from './fallback.ts';
import { detectInstalledIdes, openFolderInIde } from './ideLauncher.ts';
import { getProviderPoolsHealth, probeProviderPools } from './quotaProbe.ts';
import {
  abortSessionRun,
  clarifyRawIdea,
  extractDecisionGates,
  forkSessionScenario,
  isSessionRunning,
  regenerateBlueprintFile,
  retryFailedBlueprintFiles,
  runBlueprintAudit,
  runBlueprintLint,
  startAutoPilot,
  startBlueprintGeneration,
  startFixBlueprintIssues,
  startMasterSynthesis,
  startNextRound,
  startRedTeamRound,
  startTargetedChallenge,
  subscribeSessionEvents,
  suggestBlueprintPlan,
} from './orchestrator.ts';
import { getDefaultBlueprintPlan } from './prompts.ts';
import { scanLocalRepo } from './repoContext.ts';
import {
  buildBlueprintZipBuffer,
  deleteSession,
  exportSessionMarkdown,
  listSessions,
  loadSession,
  saveBlueprintToFolder,
  saveSession,
  slugifyProjectName,
} from './storage.ts';
import {
  APP_VERSION,
  checkForUpdates,
  runLocalGitSelfUpdate,
} from './updater.ts';
import type {
  CaliberPreference,
  CodingToolId,
  ComplexityLevel,
  DebateSession,
  DecisionGate,
  DomainMode,
  IdeId,
  ProjectMode,
  RepoSnapshotMeta,
  SeatConfig,
} from './types.ts';

const app = express();
const PORT = Number(process.env.PORT || 3847);

const ALLOWED_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i;

// Hardened local security headers (prevents clickjacking, MIME sniffing, XSS data exfiltration)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self';"
  );
  next();
});

// Guard /api/* routes against cross-site browser requests (CSRF / DNS rebinding protection)
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGIN_RE.test(origin)) {
    res.status(403).json({ error: 'Harici kaynaklardan yerel CONCEPTUS API çağrısı engellendi.' });
    return;
  }
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGIN_RE.test(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
  })
);
app.use(express.json({ limit: '6mb' }));

// Health check endpoint (used by CLI launcher, Electron desktop & diagnostics)
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'CONCEPTUS',
    version: APP_VERSION,
    uptimeSec: Math.round(process.uptime()),
  });
});

// Auto-Update Check (Zero-telemetry GitHub Releases latest version check)
app.get('/api/update/check', async (req, res) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true';
    const result = await checkForUpdates(force);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Güncelleme kontrolü başarısız oldu.' });
  }
});

// Safe 1-Click Local Web Self-Updater (git pull --ff-only + conditional npm install + vite build)
app.post('/api/update/self-update', async (_req, res) => {
  try {
    const result = await runLocalGitSelfUpdate();
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      restartRequired: false,
      message: err?.message || 'Otomatik güncelleme çalıştırılamadı.',
    });
  }
});

// Instant 0-Token Idea Complexity & Budget Estimator (<5ms)
app.post('/api/idea/analyze', (req, res) => {
  const idea = String(req.body?.idea || '');
  const constraints = String(req.body?.constraints || '');
  const contextText = String(req.body?.contextText || '');
  const domain = (req.body?.domain || 'app_product') as DomainMode;
  const caliberOverride = req.body?.caliber as CaliberPreference | undefined;
  const seatCountOverride = Number(req.body?.seatCount || 0);

  const complexity = analyzeIdeaComplexity({ idea, constraints, contextText, domain });
  const caliber: CaliberPreference =
    caliberOverride === 'flagship' || caliberOverride === 'hybrid' || caliberOverride === 'economy'
      ? caliberOverride
      : complexity.recommendedCaliber;
  const budget = estimateSessionBudget({
    seatCount: seatCountOverride > 0 ? seatCountOverride : complexity.recommendedSeatCount,
    blueprintFileCount: complexity.recommendedFileCount,
    caliber,
  });

  res.json({ complexity, budget });
});

// Providers & Models (instant cached boot + active quota cooldowns + fallback policy + pool health)
app.get('/api/providers', async (req, res) => {
  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const providers = await discoverProviders(refresh);
    res.json({
      providers,
      cooldowns: listActiveCooldowns(),
      fallbackPolicy: getFallbackPolicy(),
      poolHealth: getProviderPoolsHealth(providers),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Sağlayıcılar okunamadı.' });
  }
});

// 0-Token instant snapshot of all quota pools (auth + cooldown + recent probe)
app.get('/api/providers/health', async (_req, res) => {
  try {
    const providers = await discoverProviders(false);
    res.json({
      poolHealth: getProviderPoolsHealth(providers),
      cooldowns: listActiveCooldowns(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Kota sağlığı okunamadı.' });
  }
});

// Live parallel 1-word quota probe across installed pools
app.post('/api/providers/probe', async (req, res) => {
  try {
    const providers = await discoverProviders(false);
    const pools = Array.isArray(req.body?.pools)
      ? req.body.pools.map((x: unknown) => String(x))
      : undefined;
    const poolHealth = await probeProviderPools(providers, pools);
    res.json({
      poolHealth,
      cooldowns: listActiveCooldowns(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Kota testi çalıştırılamadı.' });
  }
});

// Update user fallback policy (quality_auto | custom | ask + preferred backup agent)
app.put('/api/settings/fallback', (req, res) => {
  try {
    const updated = setFallbackPolicy(req.body || {});
    res.json({ fallbackPolicy: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Yedek model ayarı kaydedilemedi.' });
  }
});

// Clear quota circuit-breaker cooldowns manually (e.g., after quota resets)
app.post('/api/providers/reset-cooldowns', async (_req, res) => {
  clearAllCooldowns();
  const providers = await discoverProviders(false).catch(() => []);
  res.json({
    ok: true,
    cooldowns: [],
    poolHealth: getProviderPoolsHealth(providers),
  });
});

// Fast Idea Clarifier (3-4 crisp multiple-choice questions for raw user thoughts)
app.post('/api/idea/clarify', async (req, res) => {
  try {
    const idea = String(req.body?.idea || '').trim();
    const domain = (req.body?.domain || 'app_product') as DomainMode;
    const language: 'tr' | 'en' = req.body?.language === 'en' ? 'en' : 'tr';
    if (idea.length < 10) {
      res.status(400).json({ error: 'Fikrini en az birkaç kelimeyle yazmalısın.' });
      return;
    }

    let provider = req.body?.provider;
    let model = req.body?.model;

    if (!provider || !model) {
      const providers = await discoverProviders(false);
      const agy = providers.find((p) => p.id === 'antigravity' && p.installed);
      const claude = providers.find((p) => p.id === 'claude' && p.installed);
      const codex = providers.find((p) => p.id === 'codex' && p.installed);
      if (agy) {
        provider = 'antigravity';
        model =
          agy.models.find((m) => m.id === 'gemini-3.8-flash-low')?.id ||
          agy.models.find((m) => m.id === 'gemini-3.8-flash-medium')?.id ||
          agy.models[1]?.id ||
          'auto';
      } else if (claude) {
        provider = 'claude';
        model = 'haiku';
      } else if (codex) {
        provider = 'codex';
        model = codex.models[1]?.id || 'default';
      } else {
        res.status(400).json({ error: 'Kurulu CLI aracı bulunamadı.' });
        return;
      }
    }

    const preAnalysis = analyzeIdeaComplexity({ idea, domain });
    const result = await clarifyRawIdea({
      idea,
      domain,
      language,
      missingSpecs: preAnalysis.missingSpecs,
      provider,
      model,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Fikir netleştirme soruları üretilemedi.' });
  }
});

// Native OS Folder Picker (Windows + macOS + Linux)
app.post('/api/system/pick-folder', async (req, res) => {
  try {
    const description = String(req.body?.title || 'CONCEPTUS — Proje Klasörü Seç').replace(/['"]/g, '');
    let folderPath: string | null = null;

    if (process.platform === 'win32') {
      const scriptPath = path.resolve(process.cwd(), 'server', 'pick-folder.ps1');
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-STA',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-Title',
          description,
        ],
        { timeout: 120_000, windowsHide: true }
      );
      folderPath = stdout.trim() || null;
    } else if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync(
        'osascript',
        ['-e', `POSIX path of (choose folder with prompt "${description}")`],
        { timeout: 120_000 }
      );
      folderPath = stdout.trim() || null;
    } else {
      const { stdout } = await execFileAsync(
        'zenity',
        ['--file-selection', '--directory', `--title=${description}`],
        { timeout: 120_000 }
      );
      folderPath = stdout.trim() || null;
    }

    res.json({ folderPath, cancelled: !folderPath });
  } catch (err: any) {
    // macOS/Linux user cancel returns non-zero exit code
    if (String(err?.message || '').includes('User canceled') || err?.code === 1) {
      res.json({ folderPath: null, cancelled: true });
      return;
    }
    res.status(500).json({ error: err?.message || 'Klasör seçici açılamadı.' });
  }
});

// Detect locally installed AI coding IDEs (Antigravity, Cursor, VS Code) — read-only
app.get('/api/system/ides', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    const ides = await detectInstalledIdes(force);
    res.json({ ides });
  } catch {
    res.json({ ides: [] });
  }
});

// Open a validated local directory in an allowlisted IDE or OS Explorer
app.post('/api/system/open-ide', async (req, res) => {
  try {
    const folderPath = String(req.body?.folderPath || '').trim();
    const ide = String(req.body?.ide || 'explorer').trim() as IdeId | 'explorer';
    const result = await openFolderInIde(folderPath, ide);
    if (!result.ok) {
      res.status(400).json({ error: result.error || 'IDE açılamadı.' });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'IDE açılamadı.' });
  }
});

// Local Repo Context Scanner (read-only + secret filtered)
app.post('/api/repo/scan', (req, res) => {
  try {
    const folderPath = String(req.body?.folderPath || '').trim();
    if (!folderPath) {
      res.status(400).json({ error: 'Lütfen taranacak proje klasör yolunu gir.' });
      return;
    }
    const result = scanLocalRepo(folderPath);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Klasör taranamadı.' });
  }
});

// Default MD Blueprint plan per domain (+ optional XL complexity or existing_feature mode)
app.get('/api/blueprint/defaults/:domain', (req, res) => {
  const domain = req.params.domain as DomainMode;
  const complexity = req.query.complexity as ComplexityLevel | undefined;
  const projectMode: ProjectMode =
    req.query.mode === 'existing_feature' ? 'existing_feature' : 'new_app';
  res.json({ files: getDefaultBlueprintPlan(domain, complexity, projectMode) });
});

// List sessions
app.get('/api/sessions', (_req, res) => {
  res.json({ sessions: listSessions() });
});

// Create session
app.post('/api/sessions', (req, res) => {
  try {
    const {
      title,
      idea,
      domain = 'app_product',
      projectMode = 'new_app',
      targetCodingTools,
      language = 'tr',
      caliber,
      constraints = '',
      contextText = '',
      repoMeta,
      seats = [],
    } = req.body as {
      title?: string;
      idea?: string;
      domain?: DomainMode;
      projectMode?: ProjectMode;
      targetCodingTools?: CodingToolId[];
      language?: 'tr' | 'en';
      caliber?: CaliberPreference;
      constraints?: string;
      contextText?: string;
      repoMeta?: RepoSnapshotMeta;
      seats?: SeatConfig[];
    };

    if (!idea || !idea.trim()) {
      res.status(400).json({ error: 'Lütfen tartışılacak fikri veya problemi yaz.' });
      return;
    }

    const cleanTitle =
      title?.trim() ||
      idea.trim().split(/\r?\n/)[0].slice(0, 64) ||
      (language === 'en' ? 'New Idea Session' : 'Yeni Fikir Oturumu');

    const complexity = analyzeIdeaComplexity({
      idea: idea.trim(),
      constraints: constraints.trim(),
      contextText: contextText.trim(),
      domain,
    });

    const allowedTools: CodingToolId[] = ['antigravity', 'claude_code', 'cursor', 'codex'];
    const cleanCodingTools = Array.isArray(targetCodingTools)
      ? Array.from(
          new Set(
            targetCodingTools.filter((t): t is CodingToolId =>
              allowedTools.includes(t as CodingToolId)
            )
          )
        )
      : undefined;

    const session: DebateSession = {
      id: `cpt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      title: cleanTitle,
      idea: idea.trim(),
      domain,
      projectMode: projectMode === 'existing_feature' ? 'existing_feature' : 'new_app',
      targetCodingTools: cleanCodingTools && cleanCodingTools.length > 0 ? cleanCodingTools : undefined,
      language: language === 'en' ? 'en' : 'tr',
      complexity,
      caliber: caliber || complexity.recommendedCaliber,
      constraints: constraints.trim(),
      contextText: contextText.trim(),
      repoMeta,
      seats,
      rounds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    saveSession(session);
    res.status(201).json({ session });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Oturum oluşturulamadı.' });
  }
});

// Get session
app.get('/api/sessions/:id', (req, res) => {
  const session = loadSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Oturum bulunamadı.' });
    return;
  }
  res.json({ session, activeRun: isSessionRunning(session.id) });
});

// Update seats / metadata
app.patch('/api/sessions/:id', (req, res) => {
  const session = loadSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Oturum bulunamadı.' });
    return;
  }
  const { seats, title, constraints, contextText } = req.body;
  if (Array.isArray(seats)) session.seats = seats;
  if (typeof title === 'string' && title.trim()) session.title = title.trim();
  if (typeof constraints === 'string') session.constraints = constraints;
  if (typeof contextText === 'string') session.contextText = contextText;
  saveSession(session);
  res.json({ session });
});

// Save locked user choices on Decision Gates
app.patch('/api/sessions/:id/decisions', (req, res) => {
  const session = loadSession(req.params.id);
  if (!session || !session.synthesis) {
    res.status(404).json({ error: 'Master Karar bulunamadı.' });
    return;
  }
  const gates = req.body?.decisionGates as DecisionGate[] | undefined;
  if (Array.isArray(gates)) {
    session.synthesis.decisionGates = gates;
    saveSession(session);
  }
  res.json({ synthesis: session.synthesis });
});

// Extract Decision Gates + Evolution Highlights for older sessions
app.post('/api/sessions/:id/decisions/extract', async (req, res) => {
  try {
    const { provider, model } = req.body || {};
    if (!provider || !model) {
      res.status(400).json({ error: 'Model seçilmelidir.' });
      return;
    }
    const synthesis = await extractDecisionGates(req.params.id, { provider, model });
    res.json({ synthesis });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Karar kapıları çıkarılamadı.' });
  }
});

// Delete session
app.delete('/api/sessions/:id', (req, res) => {
  abortSessionRun(req.params.id);
  const ok = deleteSession(req.params.id);
  res.json({ ok });
});

// SSE live stream
app.get('/api/sessions/:id/events', (req, res) => {
  const session = loadSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Oturum bulunamadı.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(
    `data: ${JSON.stringify({
      type: 'session_snapshot',
      session,
      activeRun: isSessionRunning(session.id),
    })}\n\n`
  );

  subscribeSessionEvents(session.id, res);

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(ping);
    }
  }, 20_000);

  res.on('close', () => clearInterval(ping));
});

// Start Auto-Pilot (Round 1 -> Round 2 -> Master Karar automatically)
app.post('/api/sessions/:id/autopilot', async (req, res) => {
  try {
    const { seats, judge } = req.body || {};
    if (!judge?.provider || !judge?.model) {
      res.status(400).json({ error: 'Oto-Pilot için hakem model gereklidir.' });
      return;
    }
    const result = await startAutoPilot(req.params.id, { seats, judge });
    res.status(202).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Oto-Pilot başlatılamadı.' });
  }
});

// Start next debate round
app.post('/api/sessions/:id/rounds', async (req, res) => {
  try {
    const { userGuidance, seats } = req.body || {};
    const result = await startNextRound(req.params.id, userGuidance, seats);
    res.status(202).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Tur başlatılamadı.' });
  }
});

// War Room: 1-Click Red-Team / Devil's Advocate Stress Test
app.post('/api/sessions/:id/red-team', async (req, res) => {
  try {
    const result = await startRedTeamRound(req.params.id, {
      seatId: req.body?.seatId ? String(req.body.seatId) : undefined,
    });
    res.status(202).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Red-Team saldırısı başlatılamadı.' });
  }
});

// War Room: Targeted Live Chair Challenge (@Agent or @All)
app.post('/api/sessions/:id/challenge', async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    const targetSeatId = req.body?.targetSeatId ? String(req.body.targetSeatId) : undefined;
    const result = await startTargetedChallenge(req.params.id, { question, targetSeatId });
    res.status(202).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Canlı müdahale başlatılamadı.' });
  }
});

// War Room: Fork session into a parallel What-If scenario
app.post('/api/sessions/:id/fork', (req, res) => {
  try {
    const forked = forkSessionScenario(req.params.id, {
      forkLabel: req.body?.forkLabel ? String(req.body.forkLabel) : undefined,
      extraConstraint: req.body?.extraConstraint ? String(req.body.extraConstraint) : undefined,
    });
    res.status(201).json({ session: forked });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Senaryo çatallanamadı.' });
  }
});

// Start Master Synthesis
app.post('/api/sessions/:id/synthesize', async (req, res) => {
  try {
    const { provider, model, effort, seatId } = req.body || {};
    if (!provider || !model) {
      res.status(400).json({ error: 'Hakem sağlayıcı ve model seçilmelidir.' });
      return;
    }
    const result = await startMasterSynthesis(req.params.id, {
      seatId,
      provider,
      model,
      effort,
    });
    res.status(202).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Master Karar başlatılamadı.' });
  }
});

// AI Suggest tailored MD blueprint file plan
app.post('/api/sessions/:id/blueprint/suggest', async (req, res) => {
  try {
    const { provider, model } = req.body || {};
    if (!provider || !model) {
      res.status(400).json({ error: 'Planlayıcı model seçilmelidir.' });
      return;
    }
    const files = await suggestBlueprintPlan(req.params.id, { provider, model });
    res.json({ files });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Dosya planı önerilemedi.' });
  }
});

// Generate MD Blueprint Pack (single-wave parallel + multi-model + depth)
app.post('/api/sessions/:id/blueprint/generate', async (req, res) => {
  try {
    const { provider, model, effort, depth, files } = req.body || {};
    if (!provider || !model || !Array.isArray(files)) {
      res.status(400).json({ error: 'Sağlayıcı, model ve dosya listesi gereklidir.' });
      return;
    }
    const blueprint = await startBlueprintGeneration(req.params.id, {
      provider,
      model,
      effort,
      depth,
      files,
    });
    res.status(202).json({ blueprint });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'MD paketi başlatılamadı.' });
  }
});

// Instant 0-Token Local Deterministic Blueprint Linter
app.post('/api/sessions/:id/blueprint/lint', (req, res) => {
  try {
    const lint = runBlueprintLint(req.params.id);
    res.json({ lint });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Yerel doğrulama çalıştırılamadı.' });
  }
});

// Cross-Agent QA Consistency Audit on generated MD Pack
app.post('/api/sessions/:id/blueprint/audit', async (req, res) => {
  try {
    const { provider, model } = req.body || {};
    if (!provider || !model) {
      res.status(400).json({ error: 'Denetçi model seçilmelidir.' });
      return;
    }
    const audit = await runBlueprintAudit(req.params.id, { provider, model });
    res.json({ audit });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'QA denetimi başarısız oldu.' });
  }
});

// 1-Click Surgical Fix for selected QA issues
app.post('/api/sessions/:id/blueprint/fix', async (req, res) => {
  try {
    const { issueIds, provider, model } = req.body || {};
    if (!Array.isArray(issueIds) || issueIds.length === 0 || !provider || !model) {
      res.status(400).json({ error: 'Sorun listesi ve model gereklidir.' });
      return;
    }
    const result = await startFixBlueprintIssues(req.params.id, {
      issueIds,
      provider,
      model,
    });
    res.status(202).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Düzeltme başlatılamadı.' });
  }
});

// 1-Click Retry ONLY failed/missing MD files with automatic quota fallback
app.post('/api/sessions/:id/blueprint/retry-failed', async (req, res) => {
  try {
    const result = await retryFailedBlueprintFiles(req.params.id, req.body || {});
    res.status(202).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Eksik dosyalar tamamlanamadı.' });
  }
});

// Regenerate a single MD file (with optional custom revision note)
app.post('/api/sessions/:id/blueprint/files/:fileId/regenerate', async (req, res) => {
  try {
    const { provider, model, effort, depth, revisionNote } = req.body || {};
    if (!provider || !model) {
      res.status(400).json({ error: 'Sağlayıcı ve model seçilmelidir.' });
      return;
    }
    const file = await regenerateBlueprintFile(req.params.id, req.params.fileId, {
      provider,
      model,
      effort,
      depth,
      revisionNote: typeof revisionNote === 'string' ? revisionNote : undefined,
    });
    res.status(202).json({ file });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Dosya yeniden üretilemedi.' });
  }
});

// Inline edit a generated MD file
app.patch('/api/sessions/:id/blueprint/files/:fileId', (req, res) => {
  const session = loadSession(req.params.id);
  if (!session || !session.blueprint) {
    res.status(404).json({ error: 'MD paketi bulunamadı.' });
    return;
  }
  const file = session.blueprint.files.find((f) => f.id === req.params.fileId);
  if (!file) {
    res.status(404).json({ error: 'Dosya bulunamadı.' });
    return;
  }
  if (typeof req.body?.content === 'string') {
    file.content = req.body.content;
    saveSession(session);
  }
  res.json({ file });
});

// Download all generated MD files as a .zip pack
app.get('/api/sessions/:id/blueprint.zip', async (req, res) => {
  try {
    const session = loadSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Oturum bulunamadı.' });
      return;
    }
    const includeClaudeMd =
      req.query.claude !== undefined
        ? req.query.claude === '1'
        : req.query.ide === '1'
          ? true
          : undefined;
    const includeCursorRules =
      req.query.cursor !== undefined
        ? req.query.cursor === '1'
        : req.query.ide === '1'
          ? true
          : undefined;
    const includeAntigravityRules =
      req.query.antigravity !== undefined ? req.query.antigravity === '1' : undefined;
    const buf = await buildBlueprintZipBuffer(session, {
      includeClaudeMd,
      includeCursorRules,
      includeAntigravityRules,
    });
    const slug = slugifyProjectName(session.title);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-md-paketi.zip"`);
    res.send(buf);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'ZIP oluşturulamadı.' });
  }
});

// Save MD Pack directly to local exports folder, linked project folder, or user-picked folder
app.post('/api/sessions/:id/blueprint/save-folder', (req, res) => {
  try {
    const session = loadSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Oturum bulunamadı.' });
      return;
    }
    let targetPath: string | undefined = req.body?.folderPath
      ? String(req.body.folderPath).trim()
      : undefined;
    if (req.body?.useLinkedRepo && session.repoMeta?.folderPath) {
      const sub = String(req.body?.subfolder || '').trim();
      targetPath = sub
        ? path.join(session.repoMeta.folderPath, sub)
        : session.repoMeta.folderPath;
    }
    const includeClaudeMd =
      req.body?.includeClaudeMd !== undefined
        ? Boolean(req.body.includeClaudeMd)
        : req.body?.includeIdeRules !== undefined
          ? Boolean(req.body.includeIdeRules)
          : undefined;
    const includeCursorRules =
      req.body?.includeCursorRules !== undefined
        ? Boolean(req.body.includeCursorRules)
        : req.body?.includeIdeRules !== undefined
          ? Boolean(req.body.includeIdeRules)
          : undefined;
    const includeAntigravityRules =
      req.body?.includeAntigravityRules !== undefined
        ? Boolean(req.body.includeAntigravityRules)
        : undefined;
    const result = saveBlueprintToFolder(session, targetPath, {
      includeClaudeMd,
      includeCursorRules,
      includeAntigravityRules,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Klasöre kaydedilemedi.' });
  }
});

// Abort running round, synthesis, autopilot, or blueprint
app.post('/api/sessions/:id/abort', (req, res) => {
  const aborted = abortSessionRun(req.params.id);
  res.json({ aborted });
});

// Export full debate report as single Markdown
app.get('/api/sessions/:id/export', (req, res) => {
  const session = loadSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Oturum bulunamadı.' });
    return;
  }
  const md = exportSessionMarkdown(session);
  const slug = slugifyProjectName(session.title);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-rapor.md"`);
  res.send(md);
});

let staticMounted = false;

export function mountFrontendStatic(customDistDir?: string) {
  if (staticMounted) return;
  const resolvedDist = customDistDir
    ? path.resolve(customDistDir)
    : path.resolve(process.cwd(), 'dist');

  if (fs.existsSync(resolvedDist)) {
    staticMounted = true;
    app.use(express.static(resolvedDist));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(resolvedDist, 'index.html'));
    });
  }
}

export async function startConceptusServer(options?: {
  port?: number;
  distDir?: string;
}): Promise<{ server: Server; port: number; url: string }> {
  reloadFallbackStateFromDisk();
  prewarmProviders();

  if (options?.distDir || process.argv.includes('--serve') || fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
    mountFrontendStatic(options?.distDir);
  }

  const requestedPort = options?.port !== undefined ? options.port : PORT;

  return new Promise((resolve, reject) => {
    const server = app.listen(requestedPort, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort =
        typeof addr === 'object' && addr ? addr.port : requestedPort;
      const url = `http://127.0.0.1:${actualPort}`;
      console.log(`\n  CONCEPTUS v4.2 hazir: ${url}\n`);
      resolve({ server, port: actualPort, url });
    });
    server.on('error', reject);
  });
}

// Auto-start when executed directly via CLI / npm start (skipped when embedded in Electron)
if (process.env.CONCEPTUS_EMBEDDED !== '1') {
  void startConceptusServer();
}
