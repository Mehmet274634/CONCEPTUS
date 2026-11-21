export type UiMode = 'simple' | 'pro';
export type SimplePresetId = 'fast' | 'balanced' | 'deep';

export interface ConceptusDesktopBridge {
  isDesktop: true;
  platform: string;
  version: string;
  pickFolder: (title?: string) => Promise<{ folderPath: string | null; cancelled: boolean }>;
  openFolderInExplorer: (folderPath: string) => Promise<void>;
}

declare global {
  interface Window {
    conceptusDesktop?: ConceptusDesktopBridge;
  }
}

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
  fallbackFrom?: string;
  role: SeatRole;
  customRoleTitle?: string;
  status: ResponseStatus;
  content: string;
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
  kind: 'blind_analysis' | 'cross_critique' | 'evolution';
  title: string;
  userGuidance?: string;
  startedAt: number;
  finishedAt?: number;
  responses: SeatResponse[];
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

export function getQuotaPoolKey(provider: ProviderId, model: string): string {
  const m = model.toLowerCase();
  if (provider === 'antigravity') {
    if (m.includes('claude')) return 'antigravity:claude';
    if (m.includes('gpt-oss')) return 'antigravity:oss';
    return 'antigravity:gemini';
  }
  return `${provider}:all`;
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
  | { type: 'blueprint_file_started'; fileId: string }
  | { type: 'blueprint_file_delta'; fileId: string; delta: string }
  | { type: 'blueprint_file_completed'; file: GeneratedMdFile }
  | { type: 'blueprint_completed'; finishedAt: number }
  | { type: 'blueprint_audit_completed'; audit: BlueprintAudit }
  | { type: 'run_aborted' }
  | { type: 'error'; message: string };

export const DOMAIN_OPTIONS: {
  id: DomainMode;
  label: string;
  short: string;
  subtitle: string;
}[] = [
  {
    id: 'app_product',
    label: 'Uygulama / Ürün',
    short: 'Ürün',
    subtitle: 'MVP, UX, farklılaşma ve büyüme',
  },
  {
    id: 'tech_project',
    label: 'Teknik Proje',
    short: 'Mimari',
    subtitle: 'Sistem tasarımı, hız ve ölçek',
  },
  {
    id: 'problem_solving',
    label: 'Sorun Çözme',
    short: 'Sorun',
    subtitle: 'Kök neden ve en etkili çözüm',
  },
  {
    id: 'strategy_general',
    label: 'Strateji & Genel',
    short: 'Strateji',
    subtitle: 'İş modeli, karar ve alternatifler',
  },
];

export const ROLE_OPTIONS: {
  id: SeatRole;
  label: string;
  short: string;
  desc: string;
}[] = [
  {
    id: 'general',
    label: 'Genel (Çok Yönlü Uzman)',
    short: 'Genel',
    desc: 'Önyargısız, bütüncül değerlendirme',
  },
  {
    id: 'chief_architect',
    label: 'Baş Sistem Mimarı',
    short: 'Sistem Mimarı',
    desc: 'Temiz mimari, hız, teknoloji seçimi',
  },
  {
    id: 'product_ux',
    label: 'Ürün & UX Direktörü',
    short: 'Ürün & UX',
    desc: 'Sadelik, kullanıcı değeri ve tutundurma',
  },
  {
    id: 'risk_auditor',
    label: 'Risk & Güvenlik Denetçisi',
    short: 'Risk Denetçisi',
    desc: 'Kör noktalar, açıklar ve tehditler',
  },
  {
    id: 'growth_strategist',
    label: 'İş & Büyüme Stratejisti',
    short: 'Stratejist',
    desc: 'Pazar farkı, gelir ve rekabet',
  },
  {
    id: 'mvp_pragmatist',
    label: 'Pragmatik MVP Lideri',
    short: 'MVP Lideri',
    desc: 'Gereksizi kes, en hızlı çalışan çekirdek',
  },
  {
    id: 'root_cause',
    label: 'Kök Neden & Problem Çözücü',
    short: 'Kök Neden',
    desc: 'Gerçek kaynak ve kalıcı çözüm',
  },
  {
    id: 'custom',
    label: 'Özel Rol Tanımla...',
    short: 'Özel Rol',
    desc: 'Kendi belirlediğin uzmanlık rolü',
  },
];

export function getRoleDisplayLabel(role: SeatRole, customTitle?: string): string {
  if (role === 'custom') return customTitle?.trim() || 'Özel Rol';
  return ROLE_OPTIONS.find((r) => r.id === role)?.short || 'Genel';
}

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  default: 'Varsayılan',
  low: 'Hızlı (Düşük)',
  medium: 'Orta',
  high: 'Yüksek',
  max: 'Maksimum',
};

export const PROVIDER_META: Record<
  ProviderId,
  {
    badge: string;
    dot: string;
    ring: string;
    shortName: string;
  }
> = {
  antigravity: {
    badge: 'bg-[#7c74ff]/15 text-[#b9b4ff] border-[#7c74ff]/30',
    dot: 'bg-[#958fff]',
    ring: 'border-[#7c74ff]/35',
    shortName: 'Antigravity',
  },
  claude: {
    badge: 'bg-[#f0b44c]/15 text-[#f7cf86] border-[#f0b44c]/30',
    dot: 'bg-[#f0b44c]',
    ring: 'border-[#f0b44c]/35',
    shortName: 'Claude',
  },
  codex: {
    badge: 'bg-[#4cc58a]/15 text-[#8ae3b7] border-[#4cc58a]/30',
    dot: 'bg-[#4cc58a]',
    ring: 'border-[#4cc58a]/35',
    shortName: 'Codex',
  },
  gemini: {
    badge: 'bg-[#3fd0c9]/15 text-[#88ece7] border-[#3fd0c9]/30',
    dot: 'bg-[#3fd0c9]',
    ring: 'border-[#3fd0c9]/35',
    shortName: 'Gemini',
  },
};
