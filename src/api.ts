import type {
  BlueprintAudit,
  BlueprintDepth,
  BlueprintFileSpec,
  BlueprintLintReport,
  BlueprintPack,
  CaliberPreference,
  ClarifyQuestion,
  CodingToolId,
  ComplexityAssessment,
  ComplexityLevel,
  DebateSession,
  DecisionGate,
  DesktopUpdateProgress,
  DetectedIde,
  DomainMode,
  EffortLevel,
  FallbackPolicy,
  GeneratedMdFile,
  IdeId,
  PoolCooldown,
  ProjectMode,
  ProviderId,
  ProviderInfo,
  ProviderPoolHealth,
  RepoSnapshotMeta,
  SeatConfig,
  SelfUpdateResult,
  SessionSummary,
  StreamEvent,
  SynthesisResult,
  UpdateCheckResult,
} from './types.ts';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `İstek hatası (${res.status})`);
  }
  return data as T;
}

export async function fetchProvidersState(refresh = false): Promise<{
  providers: ProviderInfo[];
  cooldowns: PoolCooldown[];
  fallbackPolicy: FallbackPolicy;
  poolHealth: ProviderPoolHealth[];
}> {
  const data = await requestJson<{
    providers: ProviderInfo[];
    cooldowns?: PoolCooldown[];
    fallbackPolicy?: FallbackPolicy;
    poolHealth?: ProviderPoolHealth[];
  }>(`/api/providers${refresh ? '?refresh=1' : ''}`);
  return {
    providers: data.providers,
    cooldowns: data.cooldowns || [],
    fallbackPolicy: data.fallbackPolicy || {
      mode: 'quality_auto',
      preventDowngrade: true,
    },
    poolHealth: data.poolHealth || [],
  };
}

export async function probeProviderPoolsClient(pools?: string[]): Promise<{
  poolHealth: ProviderPoolHealth[];
  cooldowns: PoolCooldown[];
}> {
  const data = await requestJson<{
    poolHealth?: ProviderPoolHealth[];
    cooldowns?: PoolCooldown[];
  }>('/api/providers/probe', {
    method: 'POST',
    body: JSON.stringify(pools ? { pools } : {}),
  });
  return {
    poolHealth: data.poolHealth || [],
    cooldowns: data.cooldowns || [],
  };
}

export async function updateFallbackPolicy(
  policy: Partial<FallbackPolicy>
): Promise<FallbackPolicy> {
  const data = await requestJson<{ fallbackPolicy: FallbackPolicy }>(
    '/api/settings/fallback',
    {
      method: 'PUT',
      body: JSON.stringify(policy),
    }
  );
  return data.fallbackPolicy;
}

export async function resetQuotaCooldowns(): Promise<{
  cooldowns: PoolCooldown[];
  poolHealth: ProviderPoolHealth[];
}> {
  const data = await requestJson<{
    cooldowns: PoolCooldown[];
    poolHealth?: ProviderPoolHealth[];
  }>('/api/providers/reset-cooldowns', { method: 'POST' });
  return {
    cooldowns: data.cooldowns || [],
    poolHealth: data.poolHealth || [],
  };
}

export async function fetchProviders(refresh = false): Promise<ProviderInfo[]> {
  const state = await fetchProvidersState(refresh);
  return state.providers;
}

export async function clarifyIdea(
  idea: string,
  domain: DomainMode,
  language: 'tr' | 'en' = 'tr'
): Promise<{ questions: ClarifyQuestion[]; durationMs: number }> {
  return requestJson('/api/idea/clarify', {
    method: 'POST',
    body: JSON.stringify({ idea, domain, language }),
  });
}

export function isDesktopApp(): boolean {
  return Boolean(typeof window !== 'undefined' && window.conceptusDesktop?.isDesktop);
}

export async function openLocalFolderInExplorer(folderPath: string): Promise<void> {
  if (typeof window !== 'undefined' && window.conceptusDesktop?.openFolderInExplorer) {
    await window.conceptusDesktop.openFolderInExplorer(folderPath);
    return;
  }
  await requestJson('/api/system/open-ide', {
    method: 'POST',
    body: JSON.stringify({ folderPath, ide: 'explorer' }),
  }).catch(() => {});
}

export async function fetchDetectedIdes(refresh = false): Promise<DetectedIde[]> {
  try {
    const data = await requestJson<{ ides: DetectedIde[] }>(
      `/api/system/ides${refresh ? '?refresh=1' : ''}`
    );
    return data.ides || [];
  } catch {
    return [];
  }
}

export async function openFolderInIde(
  folderPath: string,
  ide: IdeId | 'explorer'
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window !== 'undefined' && window.conceptusDesktop?.openFolderInIde) {
    return window.conceptusDesktop.openFolderInIde(folderPath, ide);
  }
  try {
    await requestJson<{ ok: boolean }>('/api/system/open-ide', {
      method: 'POST',
      body: JSON.stringify({ folderPath, ide }),
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'IDE açılamadı.' };
  }
}

export async function pickLocalFolder(title?: string): Promise<{
  folderPath: string | null;
  cancelled: boolean;
}> {
  // Prefer native Electron OS dialog in Desktop app (instant, parent-modal, zero subprocess!)
  if (typeof window !== 'undefined' && window.conceptusDesktop?.pickFolder) {
    return window.conceptusDesktop.pickFolder(title);
  }
  return requestJson('/api/system/pick-folder', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function scanRepoFolder(folderPath: string): Promise<{
  meta: RepoSnapshotMeta;
  snapshotText: string;
}> {
  return requestJson('/api/repo/scan', {
    method: 'POST',
    body: JSON.stringify({ folderPath }),
  });
}

export async function analyzeIdeaClient(payload: {
  idea: string;
  constraints?: string;
  contextText?: string;
  domain?: DomainMode;
  caliber?: CaliberPreference;
  seatCount?: number;
}): Promise<{
  complexity: ComplexityAssessment;
  budget: {
    debateCalls: number;
    blueprintCalls: number;
    totalCalls: number;
    estimatedSecMin: number;
    estimatedSecMax: number;
    deltaSavingsPct: number;
  };
}> {
  return requestJson('/api/idea/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchDefaultBlueprintPlan(
  domain: DomainMode,
  complexity?: ComplexityLevel,
  projectMode?: ProjectMode
): Promise<BlueprintFileSpec[]> {
  const params = new URLSearchParams();
  if (complexity) params.set('complexity', complexity);
  if (projectMode) params.set('mode', projectMode);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await requestJson<{ files: BlueprintFileSpec[] }>(
    `/api/blueprint/defaults/${domain}${qs}`
  );
  return data.files;
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const data = await requestJson<{ sessions: SessionSummary[] }>('/api/sessions');
  return data.sessions;
}

export async function createSession(payload: {
  title?: string;
  idea: string;
  domain: DomainMode;
  projectMode?: ProjectMode;
  targetCodingTools?: CodingToolId[];
  language?: 'tr' | 'en';
  caliber?: CaliberPreference;
  constraints: string;
  contextText: string;
  repoMeta?: RepoSnapshotMeta;
  seats: SeatConfig[];
}): Promise<DebateSession> {
  const data = await requestJson<{ session: DebateSession }>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.session;
}

export async function fetchSession(
  id: string
): Promise<{ session: DebateSession; activeRun: boolean }> {
  return requestJson<{ session: DebateSession; activeRun: boolean }>(
    `/api/sessions/${id}`
  );
}

export async function updateSessionSeats(
  id: string,
  seats: SeatConfig[]
): Promise<DebateSession> {
  const data = await requestJson<{ session: DebateSession }>(
    `/api/sessions/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ seats }),
    }
  );
  return data.session;
}

export async function saveDecisionGates(
  id: string,
  decisionGates: DecisionGate[]
): Promise<SynthesisResult> {
  const data = await requestJson<{ synthesis: SynthesisResult }>(
    `/api/sessions/${id}/decisions`,
    {
      method: 'PATCH',
      body: JSON.stringify({ decisionGates }),
    }
  );
  return data.synthesis;
}

export async function extractSessionDecisionGates(
  id: string,
  extractor: { provider: ProviderId; model: string }
): Promise<SynthesisResult> {
  const data = await requestJson<{ synthesis: SynthesisResult }>(
    `/api/sessions/${id}/decisions/extract`,
    {
      method: 'POST',
      body: JSON.stringify(extractor),
    }
  );
  return data.synthesis;
}

export async function removeSession(id: string): Promise<void> {
  await requestJson(`/api/sessions/${id}`, { method: 'DELETE' });
}

export async function triggerRound(
  sessionId: string,
  userGuidance?: string,
  seats?: SeatConfig[]
): Promise<void> {
  await requestJson(`/api/sessions/${sessionId}/rounds`, {
    method: 'POST',
    body: JSON.stringify({ userGuidance, seats }),
  });
}

export async function triggerRedTeam(
  sessionId: string,
  seatId?: string
): Promise<void> {
  await requestJson(`/api/sessions/${sessionId}/red-team`, {
    method: 'POST',
    body: JSON.stringify({ seatId }),
  });
}

export async function triggerTargetedChallenge(
  sessionId: string,
  question: string,
  targetSeatId?: string
): Promise<void> {
  await requestJson(`/api/sessions/${sessionId}/challenge`, {
    method: 'POST',
    body: JSON.stringify({ question, targetSeatId }),
  });
}

export async function triggerForkSession(
  sessionId: string,
  options: { forkLabel?: string; extraConstraint?: string }
): Promise<DebateSession> {
  const data = await requestJson<{ session: DebateSession }>(
    `/api/sessions/${sessionId}/fork`,
    {
      method: 'POST',
      body: JSON.stringify(options),
    }
  );
  return data.session;
}

export async function triggerBlueprintLint(
  sessionId: string
): Promise<BlueprintLintReport> {
  const data = await requestJson<{ lint: BlueprintLintReport }>(
    `/api/sessions/${sessionId}/blueprint/lint`,
    { method: 'POST' }
  );
  return data.lint;
}

export async function triggerAutoPilot(
  sessionId: string,
  options: {
    seats: SeatConfig[];
    judge: { provider: ProviderId; model: string; effort?: EffortLevel };
  }
): Promise<void> {
  await requestJson(`/api/sessions/${sessionId}/autopilot`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function triggerSynthesis(
  sessionId: string,
  judge: {
    seatId?: string;
    provider: ProviderId;
    model: string;
    effort?: EffortLevel;
  }
): Promise<void> {
  await requestJson(`/api/sessions/${sessionId}/synthesize`, {
    method: 'POST',
    body: JSON.stringify(judge),
  });
}

export async function suggestBlueprintFiles(
  sessionId: string,
  planner: { provider: ProviderId; model: string }
): Promise<BlueprintFileSpec[]> {
  const data = await requestJson<{ files: BlueprintFileSpec[] }>(
    `/api/sessions/${sessionId}/blueprint/suggest`,
    {
      method: 'POST',
      body: JSON.stringify(planner),
    }
  );
  return data.files;
}

export async function triggerBlueprintGeneration(
  sessionId: string,
  options: {
    provider: ProviderId;
    model: string;
    effort?: EffortLevel;
    depth?: BlueprintDepth;
    files: BlueprintFileSpec[];
  }
): Promise<BlueprintPack> {
  const data = await requestJson<{ blueprint: BlueprintPack }>(
    `/api/sessions/${sessionId}/blueprint/generate`,
    {
      method: 'POST',
      body: JSON.stringify(options),
    }
  );
  return data.blueprint;
}

export async function triggerBlueprintAudit(
  sessionId: string,
  auditor: { provider: ProviderId; model: string }
): Promise<BlueprintAudit> {
  const data = await requestJson<{ audit: BlueprintAudit }>(
    `/api/sessions/${sessionId}/blueprint/audit`,
    {
      method: 'POST',
      body: JSON.stringify(auditor),
    }
  );
  return data.audit;
}

export async function triggerBlueprintFix(
  sessionId: string,
  options: { issueIds: string[]; provider: ProviderId; model: string }
): Promise<{ fixingFiles: string[] }> {
  return requestJson(`/api/sessions/${sessionId}/blueprint/fix`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function triggerRetryFailedBlueprint(
  sessionId: string,
  options?: { depth?: BlueprintDepth; provider?: ProviderId; model?: string }
): Promise<{ retryingFiles: string[] }> {
  return requestJson(`/api/sessions/${sessionId}/blueprint/retry-failed`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export async function triggerRegenerateFile(
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
  const data = await requestJson<{ file: GeneratedMdFile }>(
    `/api/sessions/${sessionId}/blueprint/files/${fileId}/regenerate`,
    {
      method: 'POST',
      body: JSON.stringify(options),
    }
  );
  return data.file;
}

export async function saveBlueprintFileContent(
  sessionId: string,
  fileId: string,
  content: string
): Promise<GeneratedMdFile> {
  const data = await requestJson<{ file: GeneratedMdFile }>(
    `/api/sessions/${sessionId}/blueprint/files/${fileId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }
  );
  return data.file;
}

export async function saveBlueprintToLocalFolder(
  sessionId: string,
  options?: {
    folderPath?: string;
    useLinkedRepo?: boolean;
    subfolder?: string;
    includeClaudeMd?: boolean;
    includeCursorRules?: boolean;
    includeAntigravityRules?: boolean;
  }
): Promise<{ folderPath: string; fileCount: number }> {
  return requestJson<{ folderPath: string; fileCount: number }>(
    `/api/sessions/${sessionId}/blueprint/save-folder`,
    {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }
  );
}

export async function abortRun(sessionId: string): Promise<void> {
  await requestJson(`/api/sessions/${sessionId}/abort`, { method: 'POST' });
}

export function subscribeSessionStream(
  sessionId: string,
  onEvent: (event: StreamEvent) => void
): () => void {
  const es = new EventSource(`/api/sessions/${sessionId}/events`);
  es.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as StreamEvent;
      onEvent(parsed);
    } catch {
      // ignore ping
    }
  };
  return () => es.close();
}

export function getExportUrl(sessionId: string): string {
  return `/api/sessions/${sessionId}/export`;
}

export function getBlueprintZipUrl(
  sessionId: string,
  options?: {
    includeClaudeMd?: boolean;
    includeCursorRules?: boolean;
    includeAntigravityRules?: boolean;
  }
): string {
  const params = new URLSearchParams();
  if (options?.includeClaudeMd !== undefined) {
    params.set('claude', options.includeClaudeMd ? '1' : '0');
  }
  if (options?.includeCursorRules !== undefined) {
    params.set('cursor', options.includeCursorRules ? '1' : '0');
  }
  if (options?.includeAntigravityRules !== undefined) {
    params.set('antigravity', options.includeAntigravityRules ? '1' : '0');
  }
  const qs = params.toString();
  return `/api/sessions/${sessionId}/blueprint.zip${qs ? `?${qs}` : ''}`;
}

export async function checkForAppUpdates(force = false): Promise<UpdateCheckResult> {
  return requestJson<UpdateCheckResult>(`/api/update/check${force ? '?force=1' : ''}`);
}

export async function runWebSelfUpdate(): Promise<SelfUpdateResult> {
  const res = await fetch('/api/update/self-update', { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  return {
    ok: Boolean(data?.ok),
    updatedTo: data?.updatedTo,
    restartRequired: Boolean(data?.restartRequired),
    message: data?.message || (res.ok ? 'Güncelleme tamamlandı.' : `Hata (${res.status})`),
    log: data?.log,
  };
}

export async function downloadAndInstallDesktopUpdate(options: {
  url: string;
  filename: string;
  checksumsUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (typeof window !== 'undefined' && window.conceptusDesktop?.downloadAndInstallUpdate) {
    return window.conceptusDesktop.downloadAndInstallUpdate(options);
  }
  return { ok: false, error: 'Masaüstü köprüsü kullanılamıyor.' };
}

export function subscribeDesktopUpdateProgress(
  cb: (progress: DesktopUpdateProgress) => void
): () => void {
  if (typeof window !== 'undefined' && window.conceptusDesktop?.onUpdateProgress) {
    return window.conceptusDesktop.onUpdateProgress(cb);
  }
  return () => {};
}
