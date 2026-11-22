import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  FolderGit2,
  FolderOpen,
  Loader2,
  Palette,
  Paperclip,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { analyzeIdeaClient, clarifyIdea, pickLocalFolder, scanRepoFolder } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import {
  CODING_TOOL_OPTIONS,
  DOMAIN_OPTIONS,
  getQuotaPoolKey,
  type CaliberPreference,
  type ClarifyQuestion,
  type CodingToolId,
  type ComplexityAssessment,
  type DomainMode,
  type ProjectMode,
  type ProviderInfo,
  type ProviderPoolHealth,
  type RepoSnapshotMeta,
  type SeatConfig,
  type SimplePresetId,
  type UiMode,
} from '../types.ts';
import {
  isBlockedUploadFilename,
  MAX_UPLOAD_CHARS,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILES,
  redactUploadedSecrets,
} from '../utils/fileSafety.ts';
import { SeatEditorList } from './SeatEditorList.tsx';

interface SetupStageProps {
  providers: ProviderInfo[];
  poolHealth: ProviderPoolHealth[];
  probingPools: boolean;
  onProbePools: () => Promise<void>;
  onSwitchToHealthySeats: () => void;
  loadingProviders: boolean;
  onRefreshProviders: () => void;
  uiMode: UiMode;
  seats: SeatConfig[];
  onSeatsChange: (seats: SeatConfig[]) => void;
  onApplySimplePreset: (preset: SimplePresetId) => void;
  activePreset: SimplePresetId;
  onStartDebate: (payload: {
    title: string;
    idea: string;
    domain: DomainMode;
    projectMode: ProjectMode;
    targetCodingTools: CodingToolId[];
    caliber?: CaliberPreference;
    constraints: string;
    contextText: string;
    repoMeta?: RepoSnapshotMeta;
    seats: SeatConfig[];
    autoPilot: boolean;
  }) => Promise<void>;
  submitting: boolean;
}

const SAMPLE_IDEAS: { label: string; title: string; domain: DomainMode; text: string }[] = [
  {
    label: 'Dolaptaki malzemelerden tarif',
    title: 'DolapSef',
    domain: 'app_product',
    text: 'Evdeki dolapta kalan malzemeleri yazdığımda ne pişirebileceğimi öneren, eksik kalan malzemeleri tek tıkla alışveriş listesine ekleyen ve israfı azaltan aşırı sade bir yemek uygulaması yapmak istiyorum.',
  },
  {
    label: 'Abonelik & bütçe takipçisi',
    title: 'AboneTakip',
    domain: 'app_product',
    text: 'Kişisel aboneliklerimi (Netflix, Spotify, bulut ve AI araçları) takip eden, yenileme tarihinden 3 gün önce uyaran ve aylık gerçek sabit giderimi tek ekranda gösteren minimal bir uygulama yapmak istiyorum.',
  },
  {
    label: 'Esnaf WhatsApp randevu sistemi',
    title: 'EsnafFlow',
    domain: 'app_product',
    text: 'Küçük hizmet işletmeleri için müşterilerin WhatsApp üzerinden yazdığı mesajlarla otomatik randevu oluşturan, çakışmayı önleyen ve akşam tek mesajla günlük özet veren sıfır dashboard’lu bir sistem kurmak istiyorum.',
  },
];

const PLATFORM_CHIPS = [
  { id: 'web', label: 'Web Uygulaması', spec: 'Web Uygulaması (Tarayıcı / Responsive)' },
  { id: 'mobile', label: 'Mobil (iOS & Android)', spec: 'Mobil Uygulama (iOS & Android)' },
  { id: 'pwa', label: 'Web + Mobil (PWA)', spec: 'Offline-first PWA (Web + Mobil kurulum)' },
  { id: 'desktop', label: 'Masaüstü', spec: 'Yerel Masaüstü Uygulaması (Windows / macOS)' },
  { id: 'extension', label: 'Tarayıcı Eklentisi', spec: 'Chrome / Edge Tarayıcı Eklentisi (Manifest V3)' },
  { id: 'cli_api', label: 'CLI / API', spec: 'Geliştirici CLI aracı veya Backend API servisi' },
];

const BUDGET_CHIPS = [
  { id: 'zero', label: 'Sıfır Maliyet (Ücretsiz)', spec: 'Aylık 0 USD işletme maliyeti; harici ücretli API veya sunucu zorunluluğu yok' },
  { id: 'mvp', label: 'Hızlı MVP (1–2 Hafta)', spec: 'Tek geliştiriciyle 1–2 haftada çıkacak yalın MVP kapsamı' },
  { id: 'saas', label: 'Ölçeklenebilir SaaS', spec: 'Çok kullanıcılı, abonelik/ödeme hazır ölçeklenebilir SaaS mimarisi' },
];

const DESIGN_PRESETS = [
  {
    id: 'apple_dark_glass',
    label: 'Apple Dark Glass',
    spec: 'Apple Dark Liquid Glass (#060709 obsidian tuval, frosted yarı saydam kartlar, Montserrat/Inter, beyaz yüksek kontrastlı pill CTA butonlar, minimal 3-bölgeli düzen)',
  },
  {
    id: 'minimal_light',
    label: 'Minimalist SaaS Light',
    spec: 'Minimalist SaaS Light (#FAFAFA temiz açık zemin, ince #E5E7EB sınırlar, yüksek tipografi hiyerarşisi, sade indigo birincil aksan, bol nefes alanı)',
  },
  {
    id: 'warm_mobile',
    label: 'Sıcak Mobil Tüketici',
    spec: 'Sıcak Tüketici Mobil Dili (yumuşak 20px kartlar, sıcak krem/mercan vurgu, tek elle başparmak navigasyonu, yüksek okunurluklu görsel kartlar)',
  },
  {
    id: 'fintech_clean',
    label: 'Fintech & Analitik',
    spec: 'Fintech & Analitik Dili (keskin veri tabloları, monospace rakamlar, güven veren derin lacivert + zümrüt aksan, düşük gürültülü KPI kartları)',
  },
  {
    id: 'dev_terminal',
    label: 'Geliştirici / Terminal',
    spec: 'Geliştirici / Terminal Dili (kompakt yoğunluk, klavye kısayolu öncelikli, yüksek kontrastlı monospace kod/komut blokları)',
  },
];

export function SetupStage({
  providers,
  poolHealth,
  probingPools,
  onProbePools,
  onSwitchToHealthySeats,
  loadingProviders,
  onRefreshProviders,
  uiMode,
  seats,
  onSeatsChange,
  onApplySimplePreset,
  activePreset,
  onStartDebate,
  submitting,
}: SetupStageProps) {
  const { lang, t } = useI18n();
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [domain, setDomain] = useState<DomainMode>('app_product');
  const [projectMode, setProjectMode] = useState<ProjectMode>('new_app');
  const [targetCodingTools, setTargetCodingTools] = useState<CodingToolId[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('conceptus_target_coding_tools') || '[]');
      if (Array.isArray(saved) && saved.length > 0) return saved as CodingToolId[];
    } catch {
      // ignore
    }
    return ['antigravity'];
  });
  const [constraints, setConstraints] = useState('');
  const [contextText, setContextText] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [showDesignBar, setShowDesignBar] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [showAgentsDrawer, setShowAgentsDrawer] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const [selectedDesign, setSelectedDesign] = useState<string | null>(null);
  const [copiedInstall, setCopiedInstall] = useState<string | null>(null);
  const [showRepoBar, setShowRepoBar] = useState(false);
  const [repoPathInput, setRepoPathInput] = useState('');
  const [scanningRepo, setScanningRepo] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [repoMeta, setRepoMeta] = useState<RepoSnapshotMeta | undefined>(
    undefined
  );
  const [repoSnapshot, setRepoSnapshot] = useState('');
  const [autoPilot, setAutoPilot] = useState(true);

  // Smart Idea Clarifier state
  const [clarifying, setClarifying] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);

  // Live 0-token Complexity & Caliber Advisor
  const [caliber, setCaliber] = useState<CaliberPreference>(
    activePreset === 'deep' ? 'flagship' : activePreset === 'fast' ? 'economy' : 'hybrid'
  );
  const [complexity, setComplexity] = useState<ComplexityAssessment | null>(null);
  const [budget, setBudget] = useState<{
    totalCalls: number;
    estimatedSecMin: number;
    estimatedSecMax: number;
    deltaSavingsPct: number;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeSeatCount = seats.filter((s) => s.enabled).length;

  const installedPools = poolHealth.filter((p) => p.installed);
  const blockedPoolSet = new Set(
    poolHealth
      .filter((p) => p.status === 'limited' || p.status === 'auth_required')
      .map((p) => p.pool)
  );
  const seatsOnBlockedPools = seats.filter(
    (s) => s.enabled && blockedPoolSet.has(getQuotaPoolKey(s.provider, s.model))
  );

  const toggleCodingTool = (toolId: CodingToolId) => {
    setTargetCodingTools((prev) => {
      const exists = prev.includes(toolId);
      const next = exists
        ? prev.length > 1
          ? prev.filter((x) => x !== toolId)
          : prev
        : [...prev, toolId];
      localStorage.setItem('conceptus_target_coding_tools', JSON.stringify(next));
      return next;
    });
  };

  const handleSelectCaliber = (next: CaliberPreference) => {
    setCaliber(next);
    const mappedPreset: SimplePresetId =
      next === 'flagship' ? 'deep' : next === 'economy' ? 'fast' : 'balanced';
    onApplySimplePreset(mappedPreset);
  };

  useEffect(() => {
    const trimmed = idea.trim();
    if (trimmed.length < 12) {
      setComplexity(null);
      setBudget(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void analyzeIdeaClient({
        idea: trimmed,
        constraints,
        contextText,
        domain,
        caliber,
        seatCount: activeSeatCount || 3,
      })
        .then((res) => {
          setComplexity(res.complexity);
          setBudget(res.budget);
        })
        .catch(() => {
          // non-fatal
        });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [idea, constraints, contextText, domain, caliber, activeSeatCount]);
  const answeredClarifyCount = clarifyQuestions.filter(
    (q) => q.selectedOptionId || q.customAnswer?.trim()
  ).length;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const warnings: string[] = [];
    const files = selected.slice(0, MAX_UPLOAD_FILES);
    if (selected.length > MAX_UPLOAD_FILES) {
      warnings.push(`Tek seferde en fazla ${MAX_UPLOAD_FILES} dosya eklenebilir.`);
    }

    const chunks: string[] = [];
    let totalRedacted = 0;

    for (const file of files) {
      if (isBlockedUploadFilename(file.name)) {
        warnings.push(`"${file.name}" hassas dosya adı nedeniyle güvenlik gereği atlandı.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_FILE_BYTES) {
        warnings.push(
          `"${file.name}" çok büyük (${(file.size / 1024).toFixed(0)} KB; üst sınır ${Math.round(MAX_UPLOAD_FILE_BYTES / 1024)} KB).`
        );
        continue;
      }
      const rawText = await file.text();
      const { text: safeText, redactedCount } = redactUploadedSecrets(
        rawText.slice(0, MAX_UPLOAD_CHARS)
      );
      totalRedacted += redactedCount;
      chunks.push(`### Dosya: ${file.name}\n${safeText}`);
    }

    if (totalRedacted > 0) {
      warnings.push(
        `Eklenen dosyalarda tespit edilen ${totalRedacted} hassas anahtar/token otomatik maskelendi.`
      );
    }

    if (chunks.length > 0) {
      setContextText((prev) =>
        prev.trim() ? `${prev.trim()}\n\n${chunks.join('\n\n')}` : chunks.join('\n\n')
      );
      setShowExtras(true);
    }

    setError(warnings.length > 0 ? warnings.join(' ') : null);
    e.target.value = '';
  };

  const scanPath = async (folderPath: string) => {
    setError(null);
    setScanningRepo(true);
    try {
      const res = await scanRepoFolder(folderPath);
      setRepoMeta(res.meta);
      setRepoSnapshot(res.snapshotText);
      setRepoPathInput(res.meta.folderPath);
      if (!title.trim()) setTitle(res.meta.rootName);
      setShowRepoBar(false);
    } catch (err: any) {
      setError(err?.message || 'Klasör taranamadı.');
    } finally {
      setScanningRepo(false);
    }
  };

  const handleNativePickFolder = async () => {
    setError(null);
    setPickingFolder(true);
    try {
      const picked = await pickLocalFolder(
        'CONCEPTUS — İncelenecek & MD Kaydedilecek Proje Klasörünü Seç'
      );
      if (picked.folderPath) {
        await scanPath(picked.folderPath);
      }
    } catch (err: any) {
      setShowRepoBar(true);
      setError(
        err?.message || 'Klasör penceresi açılamadı; yolu elle yapıştırabilirsin.'
      );
    } finally {
      setPickingFolder(false);
    }
  };

  const handleClarifyIdea = async () => {
    setError(null);
    if (idea.trim().length < 10) {
      setError('Önce fikrini en az 1–2 cümleyle yaz, ardından Fikri Netleştir’e bas.');
      return;
    }
    setClarifying(true);
    try {
      const res = await clarifyIdea(idea.trim(), domain, lang);
      setClarifyQuestions(res.questions);
    } catch (err: any) {
      setError(err?.message || 'Netleştirme soruları üretilemedi.');
    } finally {
      setClarifying(false);
    }
  };

  const selectClarifyOption = (qId: string, optId: string) => {
    setClarifyQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? {
              ...q,
              selectedOptionId: q.selectedOptionId === optId ? undefined : optId,
            }
          : q
      )
    );
  };

  const buildClarifyConstraints = (): string => {
    const lines: string[] = [];
    for (const q of clarifyQuestions) {
      const opt = q.options.find((o) => o.id === q.selectedOptionId);
      const custom = q.customAnswer?.trim();
      if (!opt && !custom) continue;
      const ans = [opt?.label, custom].filter(Boolean).join(' · ');
      lines.push(`- ${q.question} → **${ans}**`);
    }
    if (lines.length === 0) return '';
    return `### Netleştirilmiş Ürün Tercihleri\n${lines.join('\n')}`;
  };

  const buildDesignSpecBlock = (): string => {
    const lines: string[] = [];
    const plat = PLATFORM_CHIPS.find((x) => x.id === selectedPlatform);
    const budg = BUDGET_CHIPS.find((x) => x.id === selectedBudget);
    const des = DESIGN_PRESETS.find((x) => x.id === selectedDesign);
    if (plat) lines.push(`- **Hedef Platform:** ${plat.spec}`);
    if (budg) lines.push(`- **Bütçe & Ölçek Kısıtı:** ${budg.spec}`);
    if (des) lines.push(`- **Kilitli Görsel Tasarım Dili:** ${des.spec}`);
    if (lines.length === 0) return '';
    return `### Kilitli Platform, Bütçe & Tasarım Dili\n${lines.join('\n')}`;
  };

  const designLockCount = [selectedPlatform, selectedBudget, selectedDesign].filter(Boolean).length;
  const zeroCliInstalled = !loadingProviders && providers.length > 0 && providers.every((p) => !p.installed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!idea.trim()) {
      setError('Lütfen tartışılacak fikri, projeyi veya problemi yaz.');
      return;
    }
    if (activeSeatCount === 0) {
      setError('En az 1 yapay zekâ ajanını aktif etmelisin.');
      return;
    }

    const designBlock = buildDesignSpecBlock();
    const clarifyBlock = buildClarifyConstraints();
    const mergedConstraints = [designBlock, clarifyBlock, constraints.trim()]
      .filter(Boolean)
      .join('\n\n');
    const mergedContext = [repoSnapshot, contextText.trim()]
      .filter(Boolean)
      .join('\n\n');

    try {
      await onStartDebate({
        title,
        idea,
        domain,
        projectMode,
        targetCodingTools,
        caliber,
        constraints: mergedConstraints,
        contextText: mergedContext,
        repoMeta,
        seats,
        autoPilot: uiMode === 'simple' ? true : autoPilot,
      });
    } catch (err: any) {
      setError(err?.message || 'Oturum başlatılamadı.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        {/* Minimal Hero + Clear 3-Step Flow */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] leading-[1.15] text-[#f7f8f8]">
            {t('Fikrini masaya koy.', 'Put your idea on the table.')}{' '}
            <span className="text-[#7d828b]">
              {t(
                'Üretim kalitesinde MD paketini çıkar.',
                'Forge a production-grade MD blueprint.'
              )}
            </span>
          </h1>
          <div className="flex items-center gap-2 text-[11.5px] text-zinc-500 flex-wrap">
            <span className="text-zinc-300 font-medium">{t('1. Fikrini Yaz', '1. Describe Idea')}</span>
            <span>→</span>
            <span>{t('2. Kararı Kilitle', '2. Lock Decision')}</span>
            <span>→</span>
            <span>{t('3. Hazır MD Paketini Al', '3. Export Ready MDs')}</span>
          </div>
        </div>

        {/* 0-CLI First-Time User Onboarding Guide (only shown if zero AI CLIs detected) */}
        {zeroCliInstalled && (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 border-[#f0b44c]/40 bg-gradient-to-br from-[#f0b44c]/[0.08] via-transparent to-[#7c74ff]/[0.06] space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#fde3a7]">
                  <Terminal className="w-3.5 h-3.5" />
                  İlk Kurulum · En Az 1 AI CLI Gerekli
                </span>
                <h2 className="text-base font-semibold text-white mt-1">
                  CONCEPTUS kendi mevcut aboneliklerinle (0 ek API ücreti) çalışır.
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Bilgisayarında henüz kurulu bir yapay zekâ CLI aracı algılanmadı. Aşağıdakilerden en az 1–2 tanesini kurup oturum açtıktan sonra <strong>Tekrar Tara</strong> butonuna bas:
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshProviders}
                disabled={loadingProviders}
                className="btn-white inline-flex items-center gap-1.5 text-xs px-4 py-2 cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingProviders ? 'animate-spin' : ''}`} />
                Tekrar Tara
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl bg-black/40 border border-white/[0.08] p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">{p.name}</span>
                    <span className="text-[10px] font-mono text-zinc-500">{p.command}</span>
                  </div>
                  {p.installHint && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] border border-white/[0.06] px-2.5 py-1.5">
                      <code className="text-[11px] font-mono text-[#88ece7] truncate">
                        {p.installHint}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(p.installHint!);
                          setCopiedInstall(p.id);
                          setTimeout(() => setCopiedInstall(null), 1500);
                        }}
                        className="text-zinc-400 hover:text-white shrink-0 cursor-pointer"
                      >
                        {copiedInstall === p.id ? (
                          <Check className="w-3.5 h-3.5 text-[#4cc58a]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Calm 2-Way Project Scope Selector: New App vs Existing Codebase Evolution */}
          <div className="flex items-center justify-between flex-wrap gap-2.5">
            <div className="inline-flex items-center p-1 rounded-full bg-white/[0.035] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setProjectMode('new_app')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                  projectMode === 'new_app'
                    ? 'bg-[#f7f8f8] text-[#060709] shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {t('Yeni Uygulama (5 MD)', 'New App (5 MDs)')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setProjectMode('existing_feature');
                  if (domain === 'strategy_general') setDomain('tech_project');
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer inline-flex items-center gap-1.5 ${
                  projectMode === 'existing_feature'
                    ? 'bg-[#f7f8f8] text-[#060709] shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                {t('Mevcut Projeye Özellik (3 MD)', 'Existing Repo Feature (3 MDs)')}
              </button>
            </div>

            {projectMode === 'existing_feature' && !repoMeta && (
              <button
                type="button"
                onClick={() => void handleNativePickFolder()}
                disabled={pickingFolder || scanningRepo}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#3fd0c9]/15 text-[#88ece7] border border-[#3fd0c9]/40 hover:bg-[#3fd0c9]/25 transition cursor-pointer disabled:opacity-50"
              >
                {pickingFolder || scanningRepo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5" />
                )}
                {t('Mevcut Proje Klasörünü Bağla', 'Link Existing Project Folder')}
              </button>
            )}
          </div>

          {/* Frosted Glass Idea Composer */}
          <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
            {/* Mode Pills + Optional Title */}
            <div className="flex items-center justify-between flex-wrap gap-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {DOMAIN_OPTIONS.map((opt) => {
                  const selected = domain === opt.id;
                  const enLabel =
                    opt.id === 'app_product'
                      ? 'App / Product'
                      : opt.id === 'tech_project'
                        ? 'Tech Project'
                        : opt.id === 'problem_solving'
                          ? 'Problem Solving'
                          : 'Strategy & General';
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDomain(opt.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                        selected
                          ? 'bg-[#f7f8f8] text-[#060709] shadow-sm'
                          : 'bg-white/[0.04] text-zinc-400 hover:text-zinc-100 border border-white/[0.07]'
                      }`}
                    >
                      {lang === 'en' ? enLabel : opt.label}
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('Proje adı (isteğe bağlı)', 'Project name (optional)')}
                className="glass-input text-xs rounded-full px-3.5 py-1.5 text-zinc-200 placeholder:text-zinc-600 w-52"
              />
            </div>

            {/* Clean Main Input */}
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={4}
              placeholder={
                projectMode === 'existing_feature'
                  ? t(
                      "Mevcut projene eklemek istediğin özelliği, ekranı veya mimari yükseltmeyi anlat... (Örn: 'Kullanıcı profiline PDF dışa aktarım ve karanlık tema senkronizasyonu eklemek istiyorum; mevcut veri yapısını bozmadan')",
                      "Describe the feature or architectural upgrade to add to your existing repo without breaking current behavior..."
                    )
                  : t(
                      "Aklındaki ham uygulama fikrini veya çözmek istediğin problemi basitçe yaz... Örn: 'Dolaptaki malzemeleri yazınca tarif öneren basit bir uygulama istiyorum'",
                      "Write your raw app idea or problem simply... e.g. 'An ultra-clean app that turns fridge ingredients into recipes and adds missing items to a shopping list'"
                    )
              }
              className="w-full bg-transparent text-[15px] text-[#f7f8f8] placeholder:text-zinc-600 focus:outline-none resize-y leading-relaxed"
            />

            {/* Empty-State Sample Chips (Disappear once typing) */}
            {!idea.trim() && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-zinc-500 mr-1">Örnek:</span>
                {SAMPLE_IDEAS.map((sample) => (
                  <button
                    key={sample.title}
                    type="button"
                    onClick={() => {
                      setTitle(sample.title);
                      setDomain(sample.domain);
                      setIdea(sample.text);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            )}

            {/* Unified Single-Line Target Coding Tool + Quality Caliber & Live Complexity Strip */}
            <div className="space-y-2.5 pt-2.5 border-t border-white/[0.06]">
              {/* Row A: Which coding tool(s) will execute these MDs? (Multi-select) */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-medium text-zinc-400 mr-1">
                    {t('Hedef Kodlama Aracı:', 'Target Coding Tool:')}
                  </span>
                  {CODING_TOOL_OPTIONS.map((tool) => {
                    const active = targetCodingTools.includes(tool.id);
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => toggleCodingTool(tool.id)}
                        title={`${tool.label} için özel MD & kural köprüsü (${tool.bridgeNote})`}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition cursor-pointer ${
                          active
                            ? 'bg-[#7c74ff]/20 text-[#e1dfff] border-[#7c74ff]/50'
                            : 'bg-white/[0.025] text-zinc-400 border-white/[0.07] hover:text-zinc-200 hover:bg-white/[0.06]'
                        }`}
                      >
                        {active && <Check className="w-2.5 h-2.5 text-[#b9b4ff]" />}
                        {tool.label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10.5px] text-zinc-500 hidden sm:inline">
                  {t(
                    'Yalnızca seçili araç(lar)a özel format & kural dosyası üretilir',
                    'Tailors prompts & bridge files exclusively for selected tool(s)'
                  )}
                </span>
              </div>

              {/* Row B: Complexity + Caliber */}
              <div className="flex items-center justify-between flex-wrap gap-2.5">
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-zinc-400">
                  {complexity ? (
                    <>
                      <span
                        title={lang === 'en' ? complexity.reasonEn : complexity.reasonTr}
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                          complexity.level === 'XL' || complexity.level === 'L'
                            ? 'bg-[#7c74ff]/15 text-[#cbc7ff] border-[#7c74ff]/40'
                            : complexity.level === 'M'
                              ? 'bg-[#3fd0c9]/15 text-[#88ece7] border-[#3fd0c9]/35'
                              : 'bg-[#4cc58a]/15 text-[#8ae3b7] border-[#4cc58a]/35'
                        }`}
                      >
                        <Cpu className="w-3 h-3" />
                        {lang === 'en' ? complexity.labelEn : complexity.labelTr}
                      </span>
                      {budget && (
                        <span className="font-mono text-[10.5px] text-zinc-500">
                          {t(
                            `${complexity.recommendedFileCount} MD · ~${budget.totalCalls} çağrı`,
                            `${complexity.recommendedFileCount} MDs · ~${budget.totalCalls} calls`
                          )}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-500">
                      {t('Ajan Kalitesi (En iyi modeller otomatik seçilir)', 'Agent Caliber (Best models auto-assigned)')}
                    </span>
                  )}
                </div>

                <div className="inline-flex items-center gap-0.5 rounded-full bg-black/40 border border-white/[0.08] p-0.5">
                  {(
                    [
                      { id: 'flagship', tr: 'Amiral', en: 'Flagship', hint: 'En güçlü modeller (karmaşık projelerde en yüksek MD kalitesi)' },
                      { id: 'hybrid', tr: 'Hibrit', en: 'Hybrid', hint: 'Önerilen kalite / hız dengesi' },
                      { id: 'economy', tr: 'Ekonomik', en: 'Economy', hint: 'Düşük kota kullanımı' },
                    ] as const
                  ).map((opt) => {
                    const active = caliber === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        title={opt.hint}
                        onClick={() => handleSelectCaliber(opt.id)}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium transition cursor-pointer ${
                          active
                            ? 'bg-[#f7f8f8] text-[#060709] font-semibold'
                            : 'text-zinc-400 hover:text-zinc-100'
                        }`}
                      >
                        {lang === 'en' ? opt.en : opt.tr}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row C: 0-Token Missing Critical Specs Radar (only when idea is typed & gaps remain) */}
              {complexity?.missingSpecs && complexity.missingSpecs.length > 0 && clarifyQuestions.length === 0 && (
                <div className="flex items-center justify-between flex-wrap gap-2 rounded-xl bg-[#f0b44c]/[0.06] border border-[#f0b44c]/20 px-3 py-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5 flex-wrap text-[#f7cf86]">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span className="font-medium">
                      {t('Eksik mimari netlik:', 'Missing spec clarity:')}
                    </span>
                    <span className="text-zinc-300">
                      {complexity.missingSpecs.slice(0, 3).join(' · ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClarifyIdea}
                    disabled={clarifying}
                    className="text-[11px] font-semibold text-[#cbc7ff] hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Wand2 className="w-3 h-3" />
                    {clarifying ? t('Hazırlanıyor...', 'Clarifying...') : t('Hızlı Netleştir', 'Clarify Now')}
                  </button>
                </div>
              )}
            </div>

            {/* Inline Smart Idea Clarifier Panel (3-4 Fast Clickable Questions) */}
            {clarifyQuestions.length > 0 && (
              <div className="rounded-2xl bg-[#7c74ff]/[0.07] border border-[#7c74ff]/30 p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#b9b4ff]" />
                    <span className="text-xs font-semibold text-white">
                      Fikrini Keskinleştir ({answeredClarifyCount}/{clarifyQuestions.length})
                    </span>
                    <span className="text-[11px] text-zinc-400 hidden sm:inline">
                      — Tıkladığın cevaplar tüm ajanlara net brif olarak gider
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setClarifyQuestions([])}
                    title="Kapat"
                    className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {clarifyQuestions.map((q, idx) => (
                    <div key={q.id} className="space-y-1.5">
                      <p className="text-xs font-medium text-zinc-200">
                        {idx + 1}. {q.question}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {q.options.map((opt) => {
                          const selected = q.selectedOptionId === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => selectClarifyOption(q.id, opt.id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition cursor-pointer ${
                                selected
                                  ? 'bg-[#f7f8f8] text-[#060709] border-[#f7f8f8] font-semibold'
                                  : 'bg-white/[0.04] text-zinc-300 border-white/[0.09] hover:bg-white/[0.08]'
                              }`}
                            >
                              {selected && <Check className="w-3 h-3 stroke-[2.5]" />}
                              {opt.label}
                            </button>
                          );
                        })}
                        <input
                          type="text"
                          value={q.customAnswer || ''}
                          onChange={(e) =>
                            setClarifyQuestions((prev) =>
                              prev.map((item) =>
                                item.id === q.id
                                  ? { ...item, customAnswer: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="veya kendin yaz..."
                          className="glass-input text-[11px] rounded-full px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600 w-36 focus:w-52 transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attached Project Folder Chip */}
            {repoMeta && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#3fd0c9]/10 border border-[#3fd0c9]/30 text-xs text-[#88ece7] max-w-full">
                <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold truncate">{repoMeta.rootName}</span>
                <span className="text-[11px] font-mono text-zinc-300 shrink-0">
                  {repoMeta.includedFiles.length} dosya ·{' '}
                  {(repoMeta.totalChars / 1024).toFixed(1)} KB
                </span>
                <span className="text-[10px] text-zinc-400 hidden sm:inline">
                  (finalde MD’ler buraya kaydedilebilir)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRepoMeta(undefined);
                    setRepoSnapshot('');
                  }}
                  title="Klasör bağlamını kaldır"
                  className="p-0.5 rounded-full hover:bg-white/15 text-zinc-300 cursor-pointer shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Manual Repo Path Input (Fallback) */}
            {showRepoBar && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={repoPathInput}
                  onChange={(e) => setRepoPathInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (repoPathInput.trim()) void scanPath(repoPathInput.trim());
                    }
                  }}
                  placeholder="Proje klasör yolu (örn: C:\Projects\my-app)"
                  className="glass-input flex-1 text-xs font-mono rounded-full px-3.5 py-2 text-zinc-100 placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={() =>
                    repoPathInput.trim() && void scanPath(repoPathInput.trim())
                  }
                  disabled={scanningRepo || !repoPathInput.trim()}
                  className="glass-pill px-3.5 py-2 rounded-full text-xs font-medium text-[#88ece7] hover:text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  {scanningRepo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FolderGit2 className="w-3.5 h-3.5" />
                  )}
                  Bağla
                </button>
              </div>
            )}

            {/* Clean Composer Footer Actions (Only 3 Calm Left Triggers + 1 Crisp CTA) */}
            <div className="pt-3 border-t border-white/[0.07] flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {/* 1. Smart Clarifier Trigger */}
                <button
                  type="button"
                  onClick={handleClarifyIdea}
                  disabled={clarifying || idea.trim().length < 10}
                  title="Ham fikrindeki eksikleri 3–4 kısa soruyla netleştirir"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer disabled:opacity-35 ${
                    clarifyQuestions.length > 0
                      ? 'bg-[#7c74ff]/20 text-[#d4d1ff] border-[#7c74ff]/45'
                      : 'glass-pill text-[#cbc7ff] hover:text-white border-[#7c74ff]/30'
                  }`}
                >
                  {clarifying ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3" />
                  )}
                  {clarifying
                    ? t('Hazırlanıyor...', 'Clarifying...')
                    : t('Fikri Netleştir', 'Clarify')}
                </button>

                {/* 2. Platform & Visual Design Presets */}
                <button
                  type="button"
                  onClick={() => setShowDesignBar((v) => !v)}
                  className={`glass-pill inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs cursor-pointer ${
                    designLockCount > 0 || showDesignBar
                      ? 'text-[#cbc7ff] border-[#7c74ff]/40'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <Palette className="w-3 h-3" />
                  {t('Tasarım & Hedef', 'Design & Target')}
                  {designLockCount > 0 && (
                    <span className="text-[10px] font-mono px-1.5 rounded-full bg-[#7c74ff]/25 text-white">
                      {designLockCount}
                    </span>
                  )}
                </button>

                {/* 3. Unified Attach / Constraints Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAttachMenuOpen((v) => !v)}
                    className={`glass-pill inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs cursor-pointer ${
                      repoMeta || constraints.trim() || contextText.trim()
                        ? 'text-[#88ece7] border-[#3fd0c9]/35'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('Ekle', 'Attach')}
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  </button>

                  {attachMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setAttachMenuOpen(false)}
                      />
                      <div className="absolute left-0 mt-2 w-60 rounded-2xl border border-white/[0.12] bg-[#101218] shadow-2xl p-1.5 z-40 space-y-0.5">
                        <button
                          type="button"
                          disabled={pickingFolder || scanningRepo}
                          onClick={() => {
                            setAttachMenuOpen(false);
                            void handleNativePickFolder();
                          }}
                          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.06] cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-[#3fd0c9]" />
                          <span>{repoMeta ? t('Proje Klasörünü Değiştir', 'Change Project Folder') : t('Proje Klasörü Bağla', 'Link Project Folder')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachMenuOpen(false);
                            fileRef.current?.click();
                          }}
                          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.06] cursor-pointer"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{t('Dosya / Doküman Yükle', 'Attach File / Doc')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachMenuOpen(false);
                            setShowExtras((v) => !v);
                          }}
                          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.06] cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-[#958fff]" />
                          <span>{t('Özel Kısıt & Not Yaz', 'Add Constraints / Notes')}</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".md,.txt,.json,.ts,.tsx,.js,.py,.yaml,.yml,.sql,.csv,.html,.css"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Execution Controls */}
              <div className="flex items-center gap-2">
                {uiMode === 'pro' && (
                  <button
                    type="button"
                    onClick={() => setAutoPilot((v) => !v)}
                    title="Oto-Pilot: Tek tıkla Tur 1 → Delta Tartışma → Master Karar otomatik akar"
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition cursor-pointer ${
                      autoPilot
                        ? 'bg-[#7c74ff]/20 text-[#d1ceff] border-[#7c74ff]/45'
                        : 'glass-pill text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Oto-Pilot
                  </button>
                )}

                <button
                  type="submit"
                  disabled={submitting || activeSeatCount === 0}
                  className="btn-white inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm cursor-pointer disabled:opacity-40"
                >
                  {submitting
                    ? t('Başlatılıyor...', 'Starting...')
                    : t('Başlat', 'Start')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Collapsible Platform, Budget & Visual Design Language Presets */}
            {showDesignBar && (
              <div className="pt-3 border-t border-white/[0.07] space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-400">
                    Hedef Platform
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PLATFORM_CHIPS.map((p) => {
                      const active = selectedPlatform === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPlatform(active ? null : p.id)}
                          className={`px-2.5 py-1 rounded-full text-[11px] border transition cursor-pointer ${
                            active
                              ? 'bg-[#f7f8f8] text-[#060709] border-[#f7f8f8] font-semibold'
                              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.08]'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-400">
                    Bütçe & Çıkış Ölçeği
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {BUDGET_CHIPS.map((b) => {
                      const active = selectedBudget === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBudget(active ? null : b.id)}
                          className={`px-2.5 py-1 rounded-full text-[11px] border transition cursor-pointer ${
                            active
                              ? 'bg-[#3fd0c9]/20 text-[#88ece7] border-[#3fd0c9]/50 font-semibold'
                              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.08]'
                          }`}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-400">
                    Görsel Tasarım Dili (02_UX_SCREENS_AND_DESIGN.md içine kilitlenir)
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {DESIGN_PRESETS.map((d) => {
                      const active = selectedDesign === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSelectedDesign(active ? null : d.id)}
                          title={d.spec}
                          className={`px-2.5 py-1 rounded-full text-[11px] border transition cursor-pointer ${
                            active
                              ? 'bg-[#7c74ff]/25 text-white border-[#7c74ff]/60 font-semibold'
                              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.08]'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Collapsible Constraints & Context */}
            {showExtras && (
              <div className="pt-3 border-t border-white/[0.07] grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                    Kısıtlar & Hedefler
                  </label>
                  <textarea
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    rows={3}
                    placeholder="Örn: Tek kişiyim, 2 haftada çıkmalı, ekstra maliyet sıfır olmalı..."
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                    Ek Doküman / Notlar
                  </label>
                  <textarea
                    value={contextText}
                    onChange={(e) => setContextText(e.target.value)}
                    rows={3}
                    placeholder="Tüm ajanların ortak göreceği notlar veya yüklenen dosyalar..."
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-2xl bg-[#ff7a6e]/10 border border-[#ff7a6e]/30 px-4 py-3 text-xs text-[#ffb0a8]">
              {error}
            </div>
          )}

          {/* Compact Real-Time Agent & Quota Readiness Bar (See which pools are open BEFORE starting!) */}
          {installedPools.length > 0 && (
            <div className="glass-panel rounded-2xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-2.5">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 shrink-0">
                  <Activity className="w-3.5 h-3.5 text-[#3fd0c9]" />
                  {t('Kota & Ajan Durumu:', 'Quota & Agents:')}
                </span>
                {installedPools.map((pool) => {
                  const isReady = pool.status === 'ready';
                  const isLimited = pool.status === 'limited';
                  const isAuth = pool.status === 'auth_required';
                  return (
                    <span
                      key={pool.pool}
                      title={
                        [pool.label, pool.planLabel, pool.detail, pool.resetHint]
                          .filter(Boolean)
                          .join(' · ')
                      }
                      className={`inline-flex items-center gap-1.5 text-[10.5px] px-2.5 py-0.5 rounded-full border ${
                        isReady
                          ? 'bg-[#4cc58a]/12 text-[#93ebb8] border-[#4cc58a]/30'
                          : isLimited
                            ? 'bg-[#ff7a6e]/12 text-[#ffb4ad] border-[#ff7a6e]/35'
                            : isAuth
                              ? 'bg-[#f0b44c]/12 text-[#f7cf86] border-[#f0b44c]/35'
                              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isReady
                            ? 'bg-[#4cc58a]'
                            : isLimited
                              ? 'bg-[#ff7a6e]'
                              : isAuth
                                ? 'bg-[#f0b44c]'
                                : 'bg-zinc-400'
                        }`}
                      />
                      <span className="font-medium">{pool.label}</span>
                      <span className="font-mono text-[10px] opacity-80">
                        {isReady
                          ? pool.latencyMs
                            ? `Açık ${(pool.latencyMs / 1000).toFixed(1)}s`
                            : 'Açık'
                          : isLimited
                            ? pool.resetHint || 'Kota Dolu'
                            : isAuth
                              ? 'Oturum Gerekli'
                              : pool.planLabel || 'Hazır'}
                      </span>
                    </span>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {seatsOnBlockedPools.length > 0 && (
                  <button
                    type="button"
                    onClick={onSwitchToHealthySeats}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f0b44c]/18 hover:bg-[#f0b44c]/28 text-[#fde3a7] border border-[#f0b44c]/40 transition cursor-pointer"
                  >
                    {t('Sağlıklı Ajanlara Geç', 'Switch to Healthy')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void onProbePools()}
                  disabled={probingPools}
                  title="Kurulu tüm ajan havuzlarına 1 kelimelik canlı kota testi atar (~4 sn)"
                  className="glass-pill inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50"
                >
                  {probingPools ? (
                    <Loader2 className="w-3 h-3 animate-spin text-[#3fd0c9]" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {probingPools
                    ? t('Test ediliyor...', 'Probing...')
                    : t('Kotaları Test Et', 'Probe Quotas')}
                </button>
              </div>
            </div>
          )}

          {/* PRO MOD: Clean Collapsible Agent Table (Never clutters the screen unless opened!) */}
          {uiMode === 'pro' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowAgentsDrawer((v) => !v)}
                className="w-full glass-panel rounded-2xl px-4 py-3 flex items-center justify-between text-xs text-zinc-300 hover:text-white transition cursor-pointer"
              >
                <span className="inline-flex items-center gap-2 font-medium">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#958fff]" />
                  {t(`Ajan Masasını Özelleştir (${activeSeatCount} aktif ajan)`, `Customize Agent Desk (${activeSeatCount} active)`)}
                </span>
                {showAgentsDrawer ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </button>

              {showAgentsDrawer && (
                <SeatEditorList
                  seats={seats}
                  providers={providers}
                  onChange={onSeatsChange}
                />
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
