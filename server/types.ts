export type ProviderId = 'claude' | 'antigravity' | 'codex' | 'gemini';

export type DomainMode =
  | 'app_product'
  | 'tech_project'
  | 'problem_solving'
  | 'strategy_general';

export type SeatRole =
  | 'general'
  | 'chief_architect'
  | 'product_ux'
  | 'risk_auditor'
  | 'growth_strategist'
  | 'mvp_pragmatist'
  | 'root_cause'
  | 'custom';

export type EffortLevel = 'default' | 'low' | 'medium' | 'high' | 'max';

export interface ModelOption {
  id: string;
  label: string;
  description?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  command: string;
  installed: boolean;
  resolvedPath?: string;
  version?: string;
  models: ModelOption[];
  supportsEffort: boolean;
  effortOptions?: EffortLevel[];
  installHint?: string;
  note?: string;
}

export interface SeatConfig {
  id: string;
  label: string;
  provider: ProviderId;
  model: string;
  role: SeatRole;
  customRoleTitle?: string;
  customRolePrompt?: string;
  effort: EffortLevel;
  economyMode: boolean;
  enabled: boolean;
}

export type ResponseStatus = 'pending' | 'running' | 'done' | 'error' | 'aborted';

export interface SeatResponse {
  seatId: string;
  seatLabel: string;
  anonymousId: string;
  provider: ProviderId;
  model: string;
  role: SeatRole;
  customRoleTitle?: string;
  status: ResponseStatus;
  content: string;
  fallbackFrom?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface DebateRound {
  roundNumber: number;
  kind: 'blind_analysis' | 'cross_critique' | 'evolution' | 'red_team' | 'targeted_challenge';
  title: string;
  userGuidance?: string;
  targetSeatId?: string;
  protocolMode?: 'full' | 'delta';
  startedAt: number;
  finishedAt?: number;
  responses: SeatResponse[];
}

export type ComplexityLevel = 'S' | 'M' | 'L' | 'XL';
export type CaliberPreference = 'flagship' | 'hybrid' | 'economy';

export interface ComplexityAssessment {
  level: ComplexityLevel;
  score: number;
  labelTr: string;
  labelEn: string;
  reasonTr: string;
  reasonEn: string;
  signals: string[];
  recommendedCaliber: CaliberPreference;
  recommendedSeatCount: number;
  recommendedDepth: BlueprintDepth;
  recommendedFileCount: number;
}

export interface ReadinessScore {
  overall: number;
  problemClarity: number;
  uxValue: number;
  technicalSolidity: number;
  securityRisk: number;
  mvpSharpness: number;
}

export interface ProjectContract {
  projectName: string;
  stack: string[];
  entities: string[];
  routes: string[];
  folderTree: string[];
  sharedComponents?: string[];
  sharedConstants?: string[];
  phases?: string[];
  hardInvariants: string[];
  nonGoals: string[];
  generatedBy?: string;
  generatedAt?: number;
  rawJson?: string;
}

export interface BlueprintLintReport {
  score: number;
  passedChecks: number;
  totalChecks: number;
  checkedAt: number;
  issues: BlueprintAuditIssue[];
}

export interface DecisionGateOption {
  id: string;
  label: string;
  tradeoff: string;
}

export interface DecisionGate {
  id: string;
  question: string;
  recommendation?: string;
  options: DecisionGateOption[];
  selectedOptionId?: string;
  customNote?: string;
}

export interface SynthesisResult {
  seatId: string;
  provider: ProviderId;
  model: string;
  fallbackFrom?: string;
  status: ResponseStatus;
  content: string;
  evolutionHighlights?: string[];
  decisionGates?: DecisionGate[];
  readinessScore?: ReadinessScore;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
}

export type BlueprintDepth = 'concise' | 'standard' | 'deep';

export type FallbackMode = 'quality_auto' | 'custom' | 'ask';

export interface FallbackPolicy {
  mode: FallbackMode;
  customProvider?: ProviderId;
  customModel?: string;
  preventDowngrade: boolean;
}

export interface PoolCooldown {
  pool: string;
  reason: string;
  detectedAt: number;
  expiresAt: number;
}

export interface BlueprintFileSpec {
  id: string;
  filename: string;
  title: string;
  purpose: string;
  selected: boolean;
  assignedProvider?: ProviderId;
  assignedModel?: string;
}

export interface GeneratedMdFile {
  id: string;
  filename: string;
  title: string;
  purpose: string;
  status: ResponseStatus;
  content: string;
  provider: ProviderId;
  model: string;
  fallbackFrom?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
}

export interface BlueprintAuditIssue {
  id: string;
  severity: 'high' | 'medium' | 'low';
  file: string;
  conflictWith?: string;
  description: string;
  fixInstruction: string;
  fixed?: boolean;
}

export interface BlueprintAudit {
  score: number;
  summary: string;
  provider: ProviderId;
  model: string;
  durationMs: number;
  checkedAt: number;
  issues: BlueprintAuditIssue[];
}

export interface BlueprintPack {
  provider: ProviderId;
  model: string;
  depth?: BlueprintDepth;
  startedAt: number;
  finishedAt?: number;
  savedFolderPath?: string;
  contract?: ProjectContract;
  lint?: BlueprintLintReport;
  files: GeneratedMdFile[];
  audit?: BlueprintAudit;
}

export interface ClarifyOption {
  id: string;
  label: string;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  options: ClarifyOption[];
  selectedOptionId?: string;
  customAnswer?: string;
}

export interface RepoSnapshotMeta {
  folderPath: string;
  rootName: string;
  totalFilesScanned: number;
  includedFiles: string[];
  totalChars: number;
}

export type AppLang = 'tr' | 'en';

export interface DebateSession {
  id: string;
  title: string;
  idea: string;
  domain: DomainMode;
  language?: AppLang;
  complexity?: ComplexityAssessment;
  caliber?: CaliberPreference;
  forkedFromId?: string;
  forkLabel?: string;
  constraints: string;
  contextText: string;
  repoMeta?: RepoSnapshotMeta;
  seats: SeatConfig[];
  rounds: DebateRound[];
  synthesis?: SynthesisResult;
  blueprint?: BlueprintPack;
  createdAt: number;
  updatedAt: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  domain: DomainMode;
  roundCount: number;
  hasSynthesis: boolean;
  blueprintFileCount: number;
  seatCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface UpdateAsset {
  name: string;
  url: string;
  sizeBytes: number;
}

export interface UpdateCheckResult {
  status: 'up_to_date' | 'update_available' | 'offline';
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseName: string;
  releaseUrl: string;
  publishedAt?: string;
  releaseNotes: string;
  setupAsset?: UpdateAsset;
  portableAsset?: UpdateAsset;
  macAsset?: UpdateAsset;
  linuxAsset?: UpdateAsset;
  checksumsUrl?: string;
  isDesktop: boolean;
  isGitRepo: boolean;
  checkedAt: number;
  error?: string;
}

export interface SelfUpdateResult {
  ok: boolean;
  updatedTo?: string;
  restartRequired: boolean;
  message: string;
  log?: string;
}

export type StreamEvent =
  | { type: 'session_snapshot'; session: DebateSession; activeRun: boolean }
  | { type: 'autopilot_stage'; stage: string }
  | { type: 'round_started'; round: DebateRound }
  | { type: 'seat_started'; roundNumber: number; seatId: string }
  | { type: 'seat_delta'; roundNumber: number; seatId: string; delta: string }
  | { type: 'seat_completed'; roundNumber: number; response: SeatResponse }
  | { type: 'round_completed'; roundNumber: number; finishedAt: number }
  | { type: 'synthesis_started'; synthesis: SynthesisResult }
  | { type: 'synthesis_delta'; delta: string }
  | { type: 'synthesis_completed'; synthesis: SynthesisResult }
  | { type: 'blueprint_started'; blueprint: BlueprintPack }
  | { type: 'blueprint_contract_ready'; contract: ProjectContract }
  | { type: 'blueprint_file_started'; fileId: string }
  | { type: 'blueprint_file_delta'; fileId: string; delta: string }
  | { type: 'blueprint_file_completed'; file: GeneratedMdFile }
  | { type: 'blueprint_lint_completed'; lint: BlueprintLintReport }
  | { type: 'blueprint_completed'; finishedAt: number }
  | { type: 'blueprint_audit_completed'; audit: BlueprintAudit }
  | { type: 'run_aborted' }
  | { type: 'error'; message: string };
