import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileCode2,
  FolderDown,
  FolderGit2,
  FolderOpen,
  Loader2,
  Lock,
  OctagonX,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  fetchDefaultBlueprintPlan,
  getBlueprintZipUrl,
  isDesktopApp,
  openLocalFolderInExplorer,
  pickLocalFolder,
  saveBlueprintFileContent,
  saveBlueprintToLocalFolder,
  suggestBlueprintFiles,
} from '../api.ts';
import { useI18n } from '../i18n.tsx';
import {
  getQuotaPoolKey,
  PROVIDER_META,
  type BlueprintDepth,
  type BlueprintFileSpec,
  type DebateSession,
  type FallbackPolicy,
  type GeneratedMdFile,
  type PoolCooldown,
  type ProviderId,
  type ProviderInfo,
  type UiMode,
} from '../types.ts';
import {
  autoAssignSpecialistModels,
  DEPTH_OPTIONS,
  pickAuditorModel,
  pickSmartHealthyBackup,
  pickWriterForDepth,
} from '../utils/blueprintRouting.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface BlueprintStageProps {
  session: DebateSession;
  providers: ProviderInfo[];
  cooldowns: PoolCooldown[];
  fallbackPolicy: FallbackPolicy;
  uiMode: UiMode;
  activeRun: boolean;
  onGeneratePack: (options: {
    provider: ProviderId;
    model: string;
    depth: BlueprintDepth;
    files: BlueprintFileSpec[];
  }) => Promise<void>;
  onRegenerateFile: (
    fileId: string,
    options: {
      provider: ProviderId;
      model: string;
      depth: BlueprintDepth;
      revisionNote?: string;
    }
  ) => Promise<void>;
  onRetryFailedFiles: (options?: {
    depth?: BlueprintDepth;
    provider?: ProviderId;
    model?: string;
  }) => Promise<void>;
  onRunAudit: (auditor: { provider: ProviderId; model: string }) => Promise<void>;
  onRunLint: () => Promise<void>;
  onFixAuditIssues: (options: {
    issueIds: string[];
    provider: ProviderId;
    model: string;
  }) => Promise<void>;
  onFileContentUpdated: (file: GeneratedMdFile) => void;
  onAbort: () => Promise<void>;
}

export function BlueprintStage({
  session,
  providers,
  cooldowns,
  fallbackPolicy,
  uiMode,
  activeRun,
  onGeneratePack,
  onRegenerateFile,
  onRetryFailedFiles,
  onRunAudit,
  onRunLint,
  onFixAuditIssues,
  onFileContentUpdated,
  onAbort,
}: BlueprintStageProps) {
  const { t } = useI18n();
  const [depth, setDepth] = useState<BlueprintDepth>(
    session.blueprint?.depth || session.complexity?.recommendedDepth || 'concise'
  );
  const initialWriter = useMemo(
    () => pickWriterForDepth(providers, depth),
    [providers]
  );

  const [genProvider, setGenProvider] = useState<ProviderId>(
    initialWriter.provider
  );
  const [genModel, setGenModel] = useState<string>(initialWriter.model);
  const [multiModelEnabled, setMultiModelEnabled] = useState(true);
  const [planFiles, setPlanFiles] = useState<BlueprintFileSpec[]>([]);
  const [showPlanner, setShowPlanner] = useState<boolean>(!session.blueprint);
  const [suggesting, setSuggesting] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    session.blueprint?.files[0]?.id || null
  );
  const [editMode, setEditMode] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedFolder, setSavedFolder] = useState<string | null>(
    session.blueprint?.savedFolderPath || null
  );
  const [savingFolder, setSavingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newFilename, setNewFilename] = useState('');
  const [newPurpose, setNewPurpose] = useState('');
  const [showBuildPrompt, setShowBuildPrompt] = useState(false);
  const [includeClaudeMd, setIncludeClaudeMd] = useState(false);
  const [includeCursorRules, setIncludeCursorRules] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [linting, setLinting] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<'none' | 'contract' | 'lint' | 'qa'>('none');

  const exhaustedPools = useMemo(
    () => new Set(cooldowns.map((c) => c.pool)),
    [cooldowns]
  );
  const installedProviders = useMemo(
    () => providers.filter((p) => p.installed),
    [providers]
  );

  const smartBackup = useMemo(
    () => pickSmartHealthyBackup(providers, depth, cooldowns, fallbackPolicy),
    [providers, depth, cooldowns, fallbackPolicy]
  );
  const [retryProvider, setRetryProvider] = useState<ProviderId>(smartBackup.provider);
  const [retryModel, setRetryModel] = useState<string>(smartBackup.model);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenProvider, setRegenProvider] = useState<ProviderId>(smartBackup.provider);
  const [regenModel, setRegenModel] = useState<string>(smartBackup.model);
  const [regenNote, setRegenNote] = useState('');

  useEffect(() => {
    setRetryProvider(smartBackup.provider);
    setRetryModel(smartBackup.model);
  }, [smartBackup.provider, smartBackup.model]);

  // Whenever Depth changes (Hızlı / Standart / Kapsamlı), smartly upgrade/switch BOTH default model & multi-model assignments (avoiding exhausted quota pools)!
  const handleDepthChange = (nextDepth: BlueprintDepth) => {
    setDepth(nextDepth);
    const tierWriter = pickWriterForDepth(providers, nextDepth, cooldowns);
    setGenProvider(tierWriter.provider);
    setGenModel(tierWriter.model);
    if (multiModelEnabled || uiMode === 'simple') {
      setPlanFiles((prev) =>
        autoAssignSpecialistModels(prev, providers, nextDepth, tierWriter, cooldowns)
      );
    }
  };

  useEffect(() => {
    const d = session.blueprint?.depth || session.complexity?.recommendedDepth || 'concise';
    setDepth(d);
    const tierWriter = pickWriterForDepth(providers, d, cooldowns);
    setGenProvider(tierWriter.provider);
    setGenModel(tierWriter.model);
  }, [session.id, session.complexity?.recommendedDepth, providers.length]);

  useEffect(() => {
    setSavedFolder(session.blueprint?.savedFolderPath || null);
    const currentDepth = session.blueprint?.depth || session.complexity?.recommendedDepth || depth;
    const tierWriter = pickWriterForDepth(providers, currentDepth, cooldowns);

    if (session.blueprint?.files.length) {
      if (
        !selectedFileId ||
        !session.blueprint.files.some((f) => f.id === selectedFileId)
      ) {
        setSelectedFileId(session.blueprint.files[0].id);
      }
      setPlanFiles(
        session.blueprint.files.map((f) => ({
          id: f.id,
          filename: f.filename,
          title: f.title,
          purpose: f.purpose,
          selected: true,
          assignedProvider: f.provider,
          assignedModel: f.model,
        }))
      );
      setShowPlanner(false);
    } else {
      setShowPlanner(true);
      void fetchDefaultBlueprintPlan(session.domain, session.complexity?.level)
        .then((files) =>
          setPlanFiles(
            autoAssignSpecialistModels(files, providers, currentDepth, tierWriter, cooldowns)
          )
        )
        .catch(() => {});
    }
  }, [session.id, session.domain, session.complexity?.level, Boolean(session.blueprint), providers.length, cooldowns.length]);

  const genProviderInfo = providers.find((p) => p.id === genProvider);
  const activeFile = useMemo(
    () =>
      session.blueprint?.files.find((f) => f.id === selectedFileId) ||
      session.blueprint?.files[0] ||
      null,
    [session.blueprint, selectedFileId]
  );

  useEffect(() => {
    if (activeFile && !editMode) {
      setDraftContent(activeFile.content);
    }
  }, [activeFile?.id, activeFile?.content, editMode]);

  const selectedPlanCount = planFiles.filter((f) => f.selected).length;
  const doneCount =
    session.blueprint?.files.filter((f) => f.status === 'done').length || 0;
  const failedCount =
    session.blueprint?.files.filter(
      (f) =>
        f.status === 'error' ||
        f.status === 'aborted' ||
        (!f.content.trim() && f.status !== 'running' && f.status !== 'pending')
    ).length || 0;
  const totalCount = session.blueprint?.files.length || 0;
  const lockedGateCount = (session.synthesis?.decisionGates || []).filter(
    (g) => g.selectedOptionId || g.customNote?.trim()
  ).length;

  const packTotalSec = useMemo(() => {
    if (!session.blueprint?.startedAt || !session.blueprint?.finishedAt) return null;
    return ((session.blueprint.finishedAt - session.blueprint.startedAt) / 1000).toFixed(1);
  }, [session.blueprint?.startedAt, session.blueprint?.finishedAt]);

  const handleToggleMultiModel = () => {
    const next = !multiModelEnabled;
    setMultiModelEnabled(next);
    if (next) {
      const tierWriter = pickWriterForDepth(providers, depth);
      setPlanFiles((prev) =>
        autoAssignSpecialistModels(prev, providers, depth, tierWriter)
      );
    } else {
      setPlanFiles((prev) =>
        prev.map((f) => ({
          ...f,
          assignedProvider: undefined,
          assignedModel: undefined,
        }))
      );
    }
  };

  const handleSuggestPlan = async () => {
    setError(null);
    setSuggesting(true);
    try {
      const fastPlanner = pickWriterForDepth(providers, 'concise');
      const suggested = await suggestBlueprintFiles(session.id, fastPlanner);
      const tierWriter = pickWriterForDepth(providers, depth);
      setPlanFiles(
        multiModelEnabled || uiMode === 'simple'
          ? autoAssignSpecialistModels(suggested, providers, depth, tierWriter)
          : suggested
      );
    } catch (err: any) {
      setError(err?.message || 'AI dosya önerisi alınamadı.');
    } finally {
      setSuggesting(false);
    }
  };

  const handleAddCustomFile = () => {
    const clean = newFilename.trim();
    if (!clean) return;
    const withExt = clean.toLowerCase().endsWith('.md') ? clean : `${clean}.md`;
    const newSpec: BlueprintFileSpec = {
      id: `md_custom_${Date.now().toString(36)}`,
      filename: withExt.toUpperCase().replace(/\s+/g, '_'),
      title: clean.replace(/\.md$/i, ''),
      purpose:
        newPurpose.trim() || 'Master Karar doğrultusunda özel proje dokümanı.',
      selected: true,
    };
    const tierWriter = pickWriterForDepth(providers, depth);
    setPlanFiles((prev) => [
      ...prev,
      ...(multiModelEnabled
        ? autoAssignSpecialistModels([newSpec], providers, depth, tierWriter)
        : [newSpec]),
    ]);
    setNewFilename('');
    setNewPurpose('');
  };

  const handleGenerate = async () => {
    setError(null);
    try {
      setShowPlanner(false);
      const useMulti = uiMode === 'simple' ? true : multiModelEnabled;
      const tierWriter = pickWriterForDepth(providers, depth);
      const preparedFiles = useMulti
        ? planFiles.map((f) =>
            f.assignedProvider && f.assignedModel
              ? f
              : autoAssignSpecialistModels([f], providers, depth, tierWriter)[0]
          )
        : planFiles.map((f) => ({
            ...f,
            assignedProvider: undefined,
            assignedModel: undefined,
          }));

      await onGeneratePack({
        provider: genProvider,
        model: genModel,
        depth,
        files: preparedFiles,
      });
    } catch (err: any) {
      setError(err?.message || 'MD paketi üretilemedi.');
    }
  };

  const handleRetryFailed = async () => {
    setError(null);
    try {
      await onRetryFailedFiles({
        depth,
        provider: retryProvider,
        model: retryModel,
      });
    } catch (err: any) {
      setError(err?.message || 'Eksik dosyalar tamamlanamadı.');
    }
  };

  const retryProviderInfo = providers.find((p) => p.id === retryProvider);
  const regenProviderInfo = providers.find((p) => p.id === regenProvider);

  const handleAudit = async () => {
    setError(null);
    setAuditing(true);
    try {
      const auditor = pickAuditorModel(
        providers,
        session.blueprint?.model || genModel
      );
      await onRunAudit(auditor);
    } catch (err: any) {
      setError(err?.message || 'QA denetimi başarısız oldu.');
    } finally {
      setAuditing(false);
    }
  };

  const handleFixIssues = async (issueIds: string[]) => {
    setError(null);
    try {
      const fastFixer = pickWriterForDepth(providers, 'concise');
      await onFixAuditIssues({
        issueIds,
        provider: fastFixer.provider,
        model: fastFixer.model,
      });
    } catch (err: any) {
      setError(err?.message || 'Otomatik düzeltme başlatılamadı.');
    }
  };

  const handleDownloadSingle = (file: GeneratedMdFile) => {
    const blob = new Blob([file.content], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunLint = async () => {
    setError(null);
    setLinting(true);
    try {
      await onRunLint();
    } catch (err: any) {
      setError(err?.message || '0-Token yerel doğrulama çalıştırılamadı.');
    } finally {
      setLinting(false);
    }
  };

  const handleSaveToLinkedRepo = async () => {
    setError(null);
    setExportMenuOpen(false);
    setSavingFolder(true);
    try {
      const res = await saveBlueprintToLocalFolder(session.id, {
        useLinkedRepo: true,
        subfolder: 'docs',
        includeClaudeMd,
        includeCursorRules,
      });
      setSavedFolder(res.folderPath);
    } catch (err: any) {
      setError(err?.message || 'Bağlı proje klasörüne kaydedilemedi.');
    } finally {
      setSavingFolder(false);
    }
  };

  const handlePickAndSaveFolder = async () => {
    setError(null);
    setExportMenuOpen(false);
    setSavingFolder(true);
    try {
      const picked = await pickLocalFolder(
        'CONCEPTUS — Üretilen MD Dosyalarının Kaydedileceği Klasörü Seç'
      );
      if (picked.folderPath) {
        const res = await saveBlueprintToLocalFolder(session.id, {
          folderPath: picked.folderPath,
          includeClaudeMd,
          includeCursorRules,
        });
        setSavedFolder(res.folderPath);
      }
    } catch (err: any) {
      setError(err?.message || 'Klasöre kaydedilemedi.');
    } finally {
      setSavingFolder(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!activeFile) return;
    setSavingEdit(true);
    try {
      const updated = await saveBlueprintFileContent(
        session.id,
        activeFile.id,
        draftContent
      );
      onFileContentUpdated(updated);
      setEditMode(false);
    } catch (err: any) {
      setError(err?.message || 'Düzenleme kaydedilemedi.');
    } finally {
      setSavingEdit(false);
    }
  };

  const audit = session.blueprint?.audit;
  const openAuditIssues = (audit?.issues || []).filter((i) => !i.fixed);

  const starterBuildPrompt = useMemo(() => {
    const doneFiles = (session.blueprint?.files || [])
      .filter((f) => f.status === 'done')
      .map((f) => f.filename);
    const fileListStr = doneFiles.length
      ? doneFiles.map((f) => `\`${f}\``).join(', ')
      : '`01_PRODUCT_VISION.md`..`05_AGENTS_START_HERE.md`';
    const folderNote = savedFolder
      ? `Dokümanlar \`${savedFolder}\` klasöründe bulunuyor.`
      : 'Bu klasördeki dokümanları referans al.';
    const contractHint = session.blueprint?.contract
      ? ' `PROJECT_CONTRACT.json` içindeki varlık adlarına, rotalara ve değiştirilemez kurallara (Hard Invariants)'
      : ' tasarım/UX kurallarına, mimari şemaya ve son dosyadaki değiştirilemez kurallara (Hard Invariants)';
    return [
      `${folderNote} Önce \`AGENTS.md\` dosyasını, ardından sırasıyla ${fileListStr} dosyalarını eksiksiz oku.`,
      `Özellikle${contractHint} %100 sadık kalarak; yol haritasındaki Faz 1'den başlayıp "${session.title}" projesini temiz, modüler ve her fazın doğrulama kapısını (Verification Gate) geçirerek inşa et.`,
    ].join('\n\n');
  }, [session.blueprint?.files, session.blueprint?.contract, session.title, savedFolder]);

  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-5">
      <div className="max-w-6xl mx-auto space-y-3.5">
        {/* Clean Minimal Header — Only Primary Actions */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-[#958fff]" />
              {t('MD Paketi', 'MD Blueprints')}
            </h2>
            {!showPlanner && totalCount > 0 && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
                {doneCount}/{totalCount}
              </span>
            )}
            {lockedGateCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full bg-[#4cc58a]/12 text-[#8ae3b7] border border-[#4cc58a]/25">
                <Lock className="w-2.5 h-2.5" />
                {t(`${lockedGateCount} Karar`, `${lockedGateCount} Locked`)}
              </span>
            )}
            {packTotalSec && !showPlanner && (
              <span className="text-[10.5px] font-mono text-zinc-500">
                {packTotalSec}s
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {showPlanner && session.blueprint && (
              <button
                onClick={() => setShowPlanner(false)}
                disabled={activeRun}
                className="glass-pill inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full text-zinc-200 hover:text-white cursor-pointer disabled:opacity-40"
              >
                Dosyalara Dön
              </button>
            )}

            {failedCount > 0 && !showPlanner && !activeRun && (
              <div className="flex items-center gap-1.5 rounded-full bg-[#f0b44c]/12 border border-[#f0b44c]/40 p-1 pl-2.5 flex-wrap">
                <select
                  value={retryProvider}
                  onChange={(e) => {
                    const p = e.target.value as ProviderId;
                    setRetryProvider(p);
                    const info = providers.find((x) => x.id === p);
                    const healthyFirst =
                      info?.models.find(
                        (m) => !exhaustedPools.has(getQuotaPoolKey(p, m.id))
                      )?.id ||
                      info?.models[1]?.id ||
                      info?.models[0]?.id ||
                      'auto';
                    setRetryModel(healthyFirst);
                  }}
                  title="Eksik dosyaları tamamlayacak yedek ajan"
                  className="text-[11px] bg-transparent text-[#fde3a7] font-medium focus:outline-none cursor-pointer"
                >
                  {installedProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={retryModel}
                  onChange={(e) => setRetryModel(e.target.value)}
                  title="Eksik dosyaları tamamlayacak yedek model"
                  className="text-[11px] font-mono bg-black/35 text-white rounded-full px-2.5 py-1 focus:outline-none max-w-[165px] cursor-pointer"
                >
                  {(retryProviderInfo?.models || []).map((m) => {
                    const isOut = exhaustedPools.has(
                      getQuotaPoolKey(retryProvider, m.id)
                    );
                    return (
                      <option key={m.id} value={m.id}>
                        {m.id}
                        {isOut ? ' (Kota Dolu)' : ''}
                      </option>
                    );
                  })}
                </select>
                <button
                  onClick={handleRetryFailed}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-[#f0b44c] hover:bg-[#f5c46d] text-[#060709] font-semibold transition cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Eksik {failedCount} Tamamla
                </button>
              </div>
            )}

            {doneCount > 0 && !showPlanner && !activeRun && (
              <>
                {/* Unified Export Popover (Clean Default: Only Universal MDs + AGENTS.md; Cursor & CLAUDE strictly opt-in) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((v) => !v)}
                    disabled={savingFolder}
                    className="glass-pill inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full text-zinc-100 border-[#3fd0c9]/35 hover:border-[#3fd0c9]/60 cursor-pointer disabled:opacity-40"
                  >
                    {savingFolder ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3fd0c9]" />
                    ) : (
                      <FolderDown className="w-3.5 h-3.5 text-[#3fd0c9]" />
                    )}
                    {t('Kaydet / İndir', 'Save / Export')}
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                  </button>

                  {exportMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setExportMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/[0.12] bg-[#101218] shadow-2xl p-2 z-40 space-y-1">
                        {session.repoMeta && (
                          <button
                            type="button"
                            onClick={handleSaveToLinkedRepo}
                            className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#88ece7] hover:bg-white/[0.06] cursor-pointer"
                          >
                            <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {session.repoMeta.rootName}/docs’a Kaydet
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handlePickAndSaveFolder}
                          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-100 hover:bg-white/[0.06] cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-[#3fd0c9] shrink-0" />
                          <span>{t('Klasör Seç & Kaydet', 'Choose Folder & Save')}</span>
                        </button>

                        <a
                          href={getBlueprintZipUrl(session.id, {
                            includeClaudeMd,
                            includeCursorRules,
                          })}
                          download
                          onClick={() => setExportMenuOpen(false)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-100 hover:bg-white/[0.06]"
                        >
                          <Archive className="w-3.5 h-3.5 text-[#958fff] shrink-0" />
                          <span>{t(`.ZIP Olarak İndir (${doneCount} MD)`, `Download .ZIP (${doneCount} MDs)`)}</span>
                        </a>

                        <div className="border-t border-white/[0.08] my-1.5 pt-2 px-3 pb-1 space-y-2">
                          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                            {t('İsteğe Bağlı Ek Dosyalar', 'Optional Tool Files')}
                          </div>
                          <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={includeClaudeMd}
                              onChange={(e) => setIncludeClaudeMd(e.target.checked)}
                              className="accent-[#7c74ff] rounded cursor-pointer"
                            />
                            <span>
                              <code className="font-mono text-zinc-200">CLAUDE.md</code>{' '}
                              <span className="text-zinc-500">(Claude Code)</span>
                            </span>
                          </label>
                          <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={includeCursorRules}
                              onChange={(e) => setIncludeCursorRules(e.target.checked)}
                              className="accent-[#7c74ff] rounded cursor-pointer"
                            />
                            <span>
                              <code className="font-mono text-zinc-200">.cursor/rules</code>{' '}
                              <span className="text-zinc-500">(Cursor IDE)</span>
                            </span>
                          </label>
                        </div>

                        <div className="border-t border-white/[0.08] pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setExportMenuOpen(false);
                              setShowPlanner(true);
                            }}
                            className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                            <span>{t('Dosya Planını Düzenle', 'Edit File Plan')}</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Primary 1-Click Build Prompt CTA */}
                <div className="inline-flex items-center rounded-full bg-[#f7f8f8] text-[#060709] p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(starterBuildPrompt);
                      setCopiedId('starter-prompt');
                      setTimeout(() => setCopiedId(null), 1800);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full hover:bg-black/5 transition cursor-pointer"
                  >
                    {copiedId === 'starter-prompt' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        {t('Kopyalandı', 'Copied')}
                      </>
                    ) : (
                      <>
                        <Rocket className="w-3.5 h-3.5" />
                        {t('Başlatma Promptu', 'Copy Build Prompt')}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBuildPrompt((v) => !v)}
                    title={t('Başlatma promptunu önizle', 'Preview starter prompt')}
                    className="p-1.5 rounded-full hover:bg-black/10 text-zinc-700 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            {activeRun && (
              <button
                onClick={onAbort}
                className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full bg-[#ff7a6e]/15 hover:bg-[#ff7a6e]/25 text-[#ffb4ad] border border-[#ff7a6e]/35 font-semibold cursor-pointer"
              >
                <OctagonX className="w-3.5 h-3.5" />
                Durdur
              </button>
            )}
          </div>
        </div>

        {/* Warning if Master Karar not yet generated */}
        {!session.synthesis?.content && (
          <div className="rounded-xl bg-[#f0b44c]/10 border border-[#f0b44c]/25 px-3.5 py-2 text-xs text-[#f7cf86] flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>
              En yüksek tutarlılık için önce <strong>2. Master Karar</strong> aşamasını tamamlaman önerilir.
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-[#ff7a6e]/10 border border-[#ff7a6e]/30 px-3.5 py-2 text-xs text-[#ffb4ad]">
            {error}
          </div>
        )}

        {/* Expandable Starter Build Prompt Preview (only when Eye clicked) */}
        {!showPlanner && showBuildPrompt && doneCount > 0 && (
          <div className="rounded-2xl bg-black/50 border border-white/[0.1] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Kodlama ajanına (Antigravity / Codex / Claude Code / Cursor) yapıştıracağın başlatma komutu:</span>
              <button
                type="button"
                onClick={() => setShowBuildPrompt(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                Gizle
              </button>
            </div>
            <pre className="text-xs font-mono text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {starterBuildPrompt}
            </pre>
          </div>
        )}

        {/* SINGLE COMPACT STATUS & QUALITY STRIP (All details neatly tucked until clicked!) */}
        {!showPlanner && session.blueprint && (
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2 rounded-2xl bg-white/[0.025] border border-white/[0.07]">
              <div className="flex items-center gap-1.5 flex-wrap">
                {session.blueprint.contract && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveInfoTab((cur) => (cur === 'contract' ? 'none' : 'contract'))
                    }
                    className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition cursor-pointer ${
                      activeInfoTab === 'contract'
                        ? 'bg-[#3fd0c9]/20 text-white border-[#3fd0c9]/50'
                        : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:text-white'
                    }`}
                  >
                    <Lock className="w-3 h-3 text-[#3fd0c9]" />
                    <span>Sözleşme ({session.blueprint.contract.entities.length})</span>
                    {activeInfoTab === 'contract' ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                )}

                {session.blueprint.lint && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveInfoTab((cur) => (cur === 'lint' ? 'none' : 'lint'))
                    }
                    className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border transition cursor-pointer ${
                      activeInfoTab === 'lint'
                        ? 'bg-white/15 text-white border-white/30'
                        : session.blueprint.lint.score >= 90
                          ? 'bg-[#4cc58a]/12 text-[#8ae3b7] border-[#4cc58a]/30'
                          : 'bg-[#f0b44c]/12 text-[#f7cf86] border-[#f0b44c]/30'
                    }`}
                  >
                    <FileCheck2 className="w-3 h-3" />
                    <span>Lint {session.blueprint.lint.score}/100</span>
                    {activeInfoTab === 'lint' ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                )}

                {audit ? (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveInfoTab((cur) => (cur === 'qa' ? 'none' : 'qa'))
                    }
                    className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border transition cursor-pointer ${
                      activeInfoTab === 'qa'
                        ? 'bg-[#7c74ff]/25 text-white border-[#7c74ff]/50'
                        : audit.score >= 90
                          ? 'bg-[#4cc58a]/12 text-[#8ae3b7] border-[#4cc58a]/30'
                          : 'bg-[#f0b44c]/12 text-[#f7cf86] border-[#f0b44c]/30'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>
                      QA {audit.score}/100
                      {openAuditIssues.length > 0 ? ` (${openAuditIssues.length} açık)` : ''}
                    </span>
                    {activeInfoTab === 'qa' ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                ) : (
                  doneCount > 0 && (
                    <button
                      type="button"
                      onClick={handleAudit}
                      disabled={auditing || activeRun}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.08] transition cursor-pointer disabled:opacity-40"
                    >
                      {auditing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3 h-3 text-[#958fff]" />
                      )}
                      {auditing ? 'Denetleniyor...' : 'QA Denetle'}
                    </button>
                  )
                )}
              </div>

              {/* Right Inline Saved Status */}
              {savedFolder && (
                <div className="flex items-center gap-2 text-[11px] text-[#8ae3b7] min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[220px] font-mono text-zinc-300" title={savedFolder}>
                    {savedFolder.split(/[\\/]/).slice(-2).join('/')}
                  </span>
                  {isDesktopApp() && (
                    <button
                      type="button"
                      onClick={() => void openLocalFolderInExplorer(savedFolder)}
                      className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[#4cc58a]/20 hover:bg-[#4cc58a]/30 text-white cursor-pointer shrink-0"
                    >
                      Aç
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Expandable Drawer: Contract */}
            {activeInfoTab === 'contract' && session.blueprint.contract && (
              <div className="rounded-2xl bg-black/45 border border-white/[0.09] p-4 text-[11px] space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-mono font-semibold text-[#88ece7]">
                    PROJECT_CONTRACT.json · {session.blueprint.contract.projectName}
                  </span>
                  {session.blueprint.contract.generatedBy && (
                    <span className="text-[10px] font-mono text-zinc-500">
                      {session.blueprint.contract.generatedBy}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-zinc-300">
                  {session.blueprint.contract.stack.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Teknoloji Yığını
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {session.blueprint.contract.stack.map((s, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-200 font-mono text-[10px]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {session.blueprint.contract.entities.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Kanonik Varlıklar
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {session.blueprint.contract.entities.map((e, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-full bg-[#7c74ff]/15 text-[#cbc7ff] font-mono text-[10px]"
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {session.blueprint.contract.sharedComponents &&
                    session.blueprint.contract.sharedComponents.length > 0 && (
                      <div className="md:col-span-2">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                          Kanonik UI Bileşenleri
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {session.blueprint.contract.sharedComponents.map((c, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-full bg-[#3fd0c9]/12 text-[#88ece7] font-mono text-[10px]"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  {session.blueprint.contract.phases &&
                    session.blueprint.contract.phases.length > 0 && (
                      <div className="md:col-span-2">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                          Kilitli İnşa Fazları (04 ↔ 05 Eşli)
                        </div>
                        <ol className="list-decimal pl-4 space-y-0.5 text-zinc-300">
                          {session.blueprint.contract.phases.map((p, idx) => (
                            <li key={idx}>{p}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  {session.blueprint.contract.hardInvariants.length > 0 && (
                    <div className="md:col-span-2">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Hard Invariants (Değiştirilemez Kurallar)
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-zinc-300">
                        {session.blueprint.contract.hardInvariants.map((rule, idx) => (
                          <li key={idx}>{rule}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Expandable Drawer: 0-Token Lint */}
            {activeInfoTab === 'lint' && session.blueprint.lint && (
              <div className="rounded-2xl bg-black/45 border border-white/[0.09] p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-200 font-medium">
                    0-Token Yerel Kontrol: {session.blueprint.lint.passedChecks}/{session.blueprint.lint.totalChecks} kontrol geçti
                  </span>
                  <button
                    type="button"
                    onClick={handleRunLint}
                    disabled={linting || activeRun}
                    className="glass-pill inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full text-zinc-200 hover:text-white cursor-pointer"
                  >
                    {linting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Yeniden Tara
                  </button>
                </div>
                {session.blueprint.lint.issues.length === 0 ? (
                  <p className="text-[11px] text-[#8ae3b7]">
                    Tüm dosyalar H1 başlık, derinlik, Mermaid diyagramı ve sözleşme uyumu açısından temiz.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {session.blueprint.lint.issues.map((iss) => (
                      <div
                        key={iss.id}
                        className="rounded-xl px-3 py-2 border border-white/[0.08] bg-white/[0.02] text-[11px] space-y-0.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[#88ece7] font-semibold">{iss.file}</span>
                          <span className="text-[10px] uppercase font-mono text-[#f7cf86]">{iss.severity}</span>
                        </div>
                        <p className="text-zinc-300">{iss.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Expandable Drawer: QA Audit */}
            {activeInfoTab === 'qa' && audit && (
              <div className="rounded-2xl bg-black/45 border border-[#7c74ff]/30 p-4 space-y-3 text-xs">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-zinc-200 leading-relaxed">{audit.summary}</p>
                    <p className="text-[10px] font-mono text-zinc-500">
                      Denetçi: {PROVIDER_META[audit.provider].shortName} · {audit.model} · {(audit.durationMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleAudit}
                      disabled={auditing || activeRun}
                      className="glass-pill inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full text-zinc-300 hover:text-white cursor-pointer"
                    >
                      {auditing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Tekrar Denetle
                    </button>
                    {openAuditIssues.length > 0 && (
                      <button
                        onClick={() => handleFixIssues(openAuditIssues.map((i) => i.id))}
                        disabled={activeRun}
                        className="btn-white inline-flex items-center gap-1.5 text-[11px] px-3 py-1 cursor-pointer disabled:opacity-40"
                      >
                        <Wrench className="w-3 h-3" />
                        Tümünü Düzelt ({openAuditIssues.length})
                      </button>
                    )}
                  </div>
                </div>

                {audit.issues.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {audit.issues.map((iss) => (
                      <div
                        key={iss.id}
                        className={`rounded-xl px-3 py-2 border flex items-start justify-between gap-3 text-[11px] ${
                          iss.fixed
                            ? 'bg-[#4cc58a]/[0.06] border-[#4cc58a]/25 opacity-70'
                            : 'bg-white/[0.025] border-white/[0.08]'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[#88ece7] font-semibold">{iss.file}</span>
                            <span className="text-[10px] uppercase font-mono text-zinc-400">
                              {iss.fixed ? 'Düzeltildi' : iss.severity}
                            </span>
                          </div>
                          <p className="text-zinc-200">{iss.description}</p>
                        </div>
                        {!iss.fixed && (
                          <button
                            onClick={() => handleFixIssues([iss.id])}
                            disabled={activeRun}
                            className="glass-pill px-2.5 py-1 rounded-full text-[11px] text-zinc-200 hover:text-white shrink-0 cursor-pointer disabled:opacity-40"
                          >
                            Düzelt
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PLANNER VIEW */}
        {showPlanner ? (
          <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
            {/* Quality Tier Selector (Always visible — drives Smart Model Tier Routing!) */}
            <div className="space-y-3 pb-4 border-b border-white/[0.08]">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {DEPTH_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = depth === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleDepthChange(opt.id)}
                      className={`text-left rounded-2xl p-3.5 border transition cursor-pointer ${
                        selected
                          ? 'bg-[#7c74ff]/15 border-[#7c74ff]/55 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                          : 'bg-white/[0.025] border-white/[0.07] text-zinc-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold inline-flex items-center gap-1.5">
                          <Icon
                            className={`w-3.5 h-3.5 ${
                              selected ? 'text-[#b9b4ff]' : 'text-zinc-400'
                            }`}
                          />
                          {opt.label}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400">
                          {opt.tierLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1.5">
                        {opt.hint}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Pro-Only Model Controls */}
              {uiMode === 'pro' && (
                <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-zinc-400">
                      Yazıcı:
                    </span>
                    <select
                      value={genProvider}
                      disabled={activeRun}
                      onChange={(e) => {
                        const p = e.target.value as ProviderId;
                        setGenProvider(p);
                        const info = providers.find((x) => x.id === p);
                        setGenModel(
                          info?.models[1]?.id || info?.models[0]?.id || 'default'
                        );
                      }}
                      className="glass-input text-xs rounded-full px-3 py-1.5 text-zinc-100"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={genModel}
                      disabled={activeRun}
                      onChange={(e) => setGenModel(e.target.value)}
                      className="glass-input text-xs font-mono rounded-full px-3 py-1.5 text-[#cbc7ff] max-w-[230px]"
                    >
                      {(
                        genProviderInfo?.models || [
                          { id: 'default', label: 'default' },
                        ]
                      ).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleToggleMultiModel}
                      title="Seçili kalite seviyesine göre her MD dosyasını uzman modele dağıtır"
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition cursor-pointer ${
                        multiModelEnabled
                          ? 'bg-[#3fd0c9]/15 text-[#88ece7] border-[#3fd0c9]/40'
                          : 'glass-pill text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Çoklu-Model Dağıt
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSuggestPlan}
                    disabled={suggesting || activeRun}
                    className="glass-pill inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full text-[#cbc7ff] hover:text-white cursor-pointer disabled:opacity-40"
                  >
                    {suggesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    {suggesting
                      ? 'Öneriliyor...'
                      : 'AI ile Özel Dosyaları Öner'}
                  </button>
                </div>
              )}

              {uiMode === 'simple' && (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] text-zinc-400">
                    Her dosya seçtiğin kalite seviyesine göre en uygun uzman modele otomatik dağıtılır.
                  </span>
                  <button
                    type="button"
                    onClick={handleSuggestPlan}
                    disabled={suggesting || activeRun}
                    className="glass-pill inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full text-[#cbc7ff] hover:text-white cursor-pointer disabled:opacity-40"
                  >
                    {suggesting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    AI Dosya Planı Öner
                  </button>
                </div>
              )}
            </div>

            {/* Selectable MD File List */}
            <div className="space-y-2.5">
              {planFiles.map((spec) => {
                const assignedProvider = spec.assignedProvider || genProvider;
                const assignedInfo = providers.find(
                  (p) => p.id === assignedProvider
                );
                return (
                  <div
                    key={spec.id}
                    className={`rounded-2xl p-3.5 border transition flex items-start gap-3 ${
                      spec.selected
                        ? 'bg-white/[0.035] border-white/[0.12]'
                        : 'bg-white/[0.01] border-white/[0.05] opacity-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setPlanFiles((prev) =>
                          prev.map((x) =>
                            x.id === spec.id
                              ? { ...x, selected: !x.selected }
                              : x
                          )
                        )
                      }
                      className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition cursor-pointer ${
                        spec.selected
                          ? 'bg-[#f7f8f8] border-[#f7f8f8]'
                          : 'border-white/25'
                      }`}
                    >
                      {spec.selected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#060709]" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0 space-y-2">
                      {uiMode === 'simple' ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">
                              {spec.title}
                            </span>
                            <span className="text-[10px] font-mono text-[#6ce5df]">
                              {spec.filename}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            {spec.purpose}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                            <input
                              type="text"
                              value={spec.filename}
                              onChange={(e) =>
                                setPlanFiles((prev) =>
                                  prev.map((x) =>
                                    x.id === spec.id
                                      ? { ...x, filename: e.target.value }
                                      : x
                                  )
                                )
                              }
                              className="sm:col-span-4 glass-input text-xs font-mono font-semibold text-[#6ce5df] rounded-xl px-2.5 py-1.5"
                            />
                            <input
                              type="text"
                              value={spec.purpose}
                              onChange={(e) =>
                                setPlanFiles((prev) =>
                                  prev.map((x) =>
                                    x.id === spec.id
                                      ? { ...x, purpose: e.target.value }
                                      : x
                                  )
                                )
                              }
                              className="sm:col-span-8 glass-input text-xs text-zinc-200 rounded-xl px-3 py-1.5"
                            />
                          </div>

                          {multiModelEnabled && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] text-zinc-500">
                                Atanan Model:
                              </span>
                              <select
                                value={assignedProvider}
                                onChange={(e) => {
                                  const np = e.target.value as ProviderId;
                                  const nInfo = providers.find((p) => p.id === np);
                                  setPlanFiles((prev) =>
                                    prev.map((x) =>
                                      x.id === spec.id
                                        ? {
                                            ...x,
                                            assignedProvider: np,
                                            assignedModel:
                                              nInfo?.models[1]?.id ||
                                              nInfo?.models[0]?.id ||
                                              'default',
                                          }
                                        : x
                                    )
                                  );
                                }}
                                className="glass-input text-[11px] rounded-full px-2.5 py-1 text-zinc-200"
                              >
                                {providers.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={spec.assignedModel || genModel}
                                onChange={(e) =>
                                  setPlanFiles((prev) =>
                                    prev.map((x) =>
                                      x.id === spec.id
                                        ? { ...x, assignedModel: e.target.value }
                                        : x
                                    )
                                  )
                                }
                                className="glass-input text-[11px] font-mono rounded-full px-2.5 py-1 text-[#cbc7ff] max-w-[220px]"
                              >
                                {(assignedInfo?.models || []).map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.id}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {uiMode === 'pro' && (
                      <button
                        type="button"
                        onClick={() =>
                          setPlanFiles((prev) =>
                            prev.filter((x) => x.id !== spec.id)
                          )
                        }
                        className="p-1.5 rounded-full hover:bg-red-500/15 text-zinc-500 hover:text-[#ff7a6e] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Custom MD File (Pro Mode) */}
            {uiMode === 'pro' && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2">
                <input
                  type="text"
                  value={newFilename}
                  onChange={(e) => setNewFilename(e.target.value)}
                  placeholder="Özel dosya adı (örn: DATABASE_SCHEMA.md)"
                  className="sm:col-span-4 glass-input text-xs font-mono rounded-xl px-3 py-2 text-zinc-100 placeholder:text-zinc-600"
                />
                <input
                  type="text"
                  value={newPurpose}
                  onChange={(e) => setNewPurpose(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomFile();
                    }
                  }}
                  placeholder="Bu dosyanın kapsamı ve amacı..."
                  className="sm:col-span-6 glass-input text-xs rounded-xl px-3 py-2 text-zinc-100 placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={handleAddCustomFile}
                  disabled={!newFilename.trim()}
                  className="sm:col-span-2 glass-pill rounded-xl text-xs font-medium text-zinc-200 hover:text-white inline-flex items-center justify-center gap-1 py-2 cursor-pointer disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ekle
                </button>
              </div>
            )}

            {/* Generate CTA */}
            <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-zinc-400">
                {session.repoMeta ? (
                  <>
                    Üretim bitince tek tıkla{' '}
                    <span className="text-[#88ece7] font-mono">
                      {session.repoMeta.rootName}/docs
                    </span>{' '}
                    içine kaydedebilirsin.
                  </>
                ) : (
                  <>
                    Seçili dosyalar tek dalgada paralel üretilir; ardından istediğin klasöre kaydedebilir veya `.zip` indirebilirsin.
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={activeRun || selectedPlanCount === 0}
                className="btn-white inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm cursor-pointer disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4" />
                MD Paketini Üret ({selectedPlanCount} Dosya)
              </button>
            </div>
          </div>
        ) : (
          /* GENERATED MD STUDIO SPLIT VIEW */
          session.blueprint && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left File List */}
              <div className="lg:col-span-4 glass-panel rounded-2xl p-3 space-y-1.5">
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Dosyalar ({doneCount}/{totalCount})
                  </span>
                </div>

                {session.blueprint.files.map((file) => {
                  const isSelected = activeFile?.id === file.id;
                  return (
                    <button
                      key={file.id}
                      onClick={() => {
                        setSelectedFileId(file.id);
                        setEditMode(false);
                        setRegenOpen(false);
                      }}
                      className={`w-full text-left rounded-xl px-3 py-2.5 border transition cursor-pointer ${
                        isSelected
                          ? 'bg-white/[0.09] border-[#7c74ff]/45 text-white'
                          : 'bg-white/[0.02] border-transparent hover:bg-white/[0.05] text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-semibold truncate text-[#88ece7]">
                          {file.filename}
                        </span>
                        {file.status === 'running' && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#958fff] shrink-0" />
                        )}
                        {file.status === 'pending' && (
                          <span className="text-[10px] text-zinc-500">sıra</span>
                        )}
                        {file.status === 'done' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#4cc58a] shrink-0" />
                        )}
                        {file.status === 'error' && (
                          <AlertTriangle className="w-3.5 h-3.5 text-[#ff7a6e] shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono text-zinc-500 truncate">
                            {file.model}
                          </span>
                          {file.fallbackFrom && (
                            <span
                              title={`Kota/limit nedeniyle ${file.fallbackFrom} yerine yedek model kullanıldı`}
                              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[#f0b44c]/15 text-[#f7cf86] border border-[#f0b44c]/30 shrink-0"
                            >
                              ↻ Yedek
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 shrink-0">
                          {file.durationMs && (
                            <span>{(file.durationMs / 1000).toFixed(0)}s</span>
                          )}
                          {file.content && (
                            <span>{(file.content.length / 1024).toFixed(1)} KB</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Preview / Editor */}
              <div className="lg:col-span-8 glass-panel rounded-2xl overflow-hidden min-h-[520px] flex flex-col">
                {activeFile ? (
                  <>
                    <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between flex-wrap gap-2 bg-white/[0.02]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-semibold text-white truncate">
                            {activeFile.filename}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
                            {activeFile.model}
                          </span>
                          {activeFile.fallbackFrom && (
                            <span
                              title={`Kota/limit nedeniyle ${activeFile.fallbackFrom} yerine otomatik yedek model devraldı`}
                              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f0b44c]/15 text-[#f7cf86] border border-[#f0b44c]/30"
                            >
                              ↻ Yedek ({activeFile.fallbackFrom})
                            </span>
                          )}
                          {activeFile.durationMs && (
                            <span className="text-[11px] font-mono text-zinc-500">
                              {(activeFile.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {activeFile.purpose}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {activeFile.status === 'done' && (
                          <button
                            onClick={() => {
                              if (editMode) setEditMode(false);
                              else {
                                setDraftContent(activeFile.content);
                                setEditMode(true);
                              }
                            }}
                            className="glass-pill inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full text-zinc-300 hover:text-white cursor-pointer"
                          >
                            {editMode ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                Önizle
                              </>
                            ) : (
                              <>
                                <Edit3 className="w-3.5 h-3.5" />
                                Düzenle
                              </>
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => {
                            if (regenOpen) {
                              setRegenOpen(false);
                              return;
                            }
                            const origOut = exhaustedPools.has(
                              getQuotaPoolKey(activeFile.provider, activeFile.model)
                            );
                            if (origOut) {
                              setRegenProvider(smartBackup.provider);
                              setRegenModel(smartBackup.model);
                            } else {
                              setRegenProvider(activeFile.provider || smartBackup.provider);
                              setRegenModel(activeFile.model || smartBackup.model);
                            }
                            setRegenOpen(true);
                          }}
                          disabled={activeRun}
                          title="Model seçerek bu dosyayı yeniden üret"
                          className={`glass-pill p-1.5 rounded-full transition cursor-pointer disabled:opacity-40 ${
                            regenOpen
                              ? 'bg-white/15 text-white border-[#7c74ff]/50'
                              : 'text-zinc-300 hover:text-white'
                          }`}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(activeFile.content);
                            setCopiedId(activeFile.id);
                            setTimeout(() => setCopiedId(null), 1500);
                          }}
                          disabled={!activeFile.content}
                          title="Kopyala"
                          className="glass-pill p-1.5 rounded-full text-zinc-300 hover:text-white cursor-pointer disabled:opacity-40"
                        >
                          {copiedId === activeFile.id ? (
                            <Check className="w-3.5 h-3.5 text-[#4cc58a]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => handleDownloadSingle(activeFile)}
                          disabled={!activeFile.content}
                          className="glass-pill inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full text-zinc-200 hover:text-white cursor-pointer disabled:opacity-40"
                        >
                          <Download className="w-3.5 h-3.5" />
                          İndir
                        </button>
                      </div>
                    </div>

                    {regenOpen && !activeRun && (
                      <div className="px-5 py-3 border-b border-white/[0.08] bg-[#7c74ff]/[0.08] space-y-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-[11px] font-medium text-zinc-200">
                            Bu dosyayı seçtiğin ajanla (isteğe bağlı revizyon notuyla) yeniden üret:
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <select
                              value={regenProvider}
                              onChange={(e) => {
                                const p = e.target.value as ProviderId;
                                setRegenProvider(p);
                                const info = providers.find((x) => x.id === p);
                                const healthyFirst =
                                  info?.models.find(
                                    (m) => !exhaustedPools.has(getQuotaPoolKey(p, m.id))
                                  )?.id ||
                                  info?.models[1]?.id ||
                                  info?.models[0]?.id ||
                                  'auto';
                                setRegenModel(healthyFirst);
                              }}
                              className="glass-input text-[11px] rounded-full px-2.5 py-1 text-zinc-200"
                            >
                              {installedProviders.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={regenModel}
                              onChange={(e) => setRegenModel(e.target.value)}
                              className="glass-input text-[11px] font-mono rounded-full px-2.5 py-1 text-[#cbc7ff] max-w-[200px]"
                            >
                              {(regenProviderInfo?.models || []).map((m) => {
                                const isOut = exhaustedPools.has(
                                  getQuotaPoolKey(regenProvider, m.id)
                                );
                                return (
                                  <option key={m.id} value={m.id}>
                                    {m.id}
                                    {isOut ? ' (Kota Dolu)' : ''}
                                  </option>
                                );
                              })}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const note = regenNote.trim();
                                setRegenOpen(false);
                                setRegenNote('');
                                void onRegenerateFile(activeFile.id, {
                                  provider: regenProvider,
                                  model: regenModel,
                                  depth,
                                  revisionNote: note || undefined,
                                });
                              }}
                              className="btn-white text-[11px] px-3.5 py-1 cursor-pointer"
                            >
                              Üret
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRegenOpen(false);
                                setRegenNote('');
                              }}
                              className="text-[11px] text-zinc-400 hover:text-white px-2 py-1 cursor-pointer"
                            >
                              Vazgeç
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={regenNote}
                          onChange={(e) => setRegenNote(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const note = regenNote.trim();
                              setRegenOpen(false);
                              setRegenNote('');
                              void onRegenerateFile(activeFile.id, {
                                provider: regenProvider,
                                model: regenModel,
                                depth,
                                revisionNote: note || undefined,
                              });
                            }
                          }}
                          placeholder="İsteğe bağlı revizyon notu (örn: Veritabanını SQLite yerine Supabase yap, offline mod ekle...)"
                          className="glass-input w-full text-xs rounded-xl px-3 py-1.5 text-zinc-100 placeholder:text-zinc-500"
                        />
                      </div>
                    )}

                    <div className="p-5 flex-1 overflow-y-auto max-h-[68vh]">
                      {activeFile.status === 'error' ? (
                        <div className="rounded-2xl bg-[#ff7a6e]/10 border border-[#ff7a6e]/30 p-5 text-xs text-[#ffb4ad] space-y-4">
                          <div>
                            <p className="font-semibold text-sm text-white">
                              Üretim hatası (Kota veya model limiti)
                            </p>
                            <p className="mt-1.5 leading-relaxed opacity-90">
                              {activeFile.error}
                            </p>
                          </div>

                          <div className="rounded-xl bg-black/35 border border-white/[0.08] p-3.5 space-y-2.5">
                            <p className="text-[11px] font-medium text-zinc-200">
                              Eksik {failedCount} dosyayı tamamlamak için istediğin güçlü yedek ajanı seç:
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                value={retryProvider}
                                onChange={(e) => {
                                  const p = e.target.value as ProviderId;
                                  setRetryProvider(p);
                                  const info = providers.find((x) => x.id === p);
                                  const healthyFirst =
                                    info?.models.find(
                                      (m) => !exhaustedPools.has(getQuotaPoolKey(p, m.id))
                                    )?.id ||
                                    info?.models[1]?.id ||
                                    info?.models[0]?.id ||
                                    'auto';
                                  setRetryModel(healthyFirst);
                                }}
                                className="glass-input text-xs rounded-full px-3 py-1.5 text-zinc-100"
                              >
                                {installedProviders.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={retryModel}
                                onChange={(e) => setRetryModel(e.target.value)}
                                className="glass-input text-xs font-mono rounded-full px-3 py-1.5 text-[#cbc7ff] max-w-[230px]"
                              >
                                {(retryProviderInfo?.models || []).map((m) => {
                                  const isOut = exhaustedPools.has(
                                    getQuotaPoolKey(retryProvider, m.id)
                                  );
                                  return (
                                    <option key={m.id} value={m.id}>
                                      {m.id}
                                      {isOut ? ' (Kota Dolu)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                              <button
                                type="button"
                                onClick={handleRetryFailed}
                                disabled={activeRun}
                                className="btn-white inline-flex items-center gap-1.5 text-xs px-4 py-1.5 cursor-pointer disabled:opacity-40"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Seçili Ajanla Tamamla ({failedCount})
                              </button>
                            </div>
                            <p className="text-[11px] text-zinc-400">
                              Tamamlanan {doneCount} dosya aynen korunur; yalnızca eksik dosyalar seçtiğin ajanla üretilir.
                            </p>
                          </div>
                        </div>
                      ) : editMode ? (
                        <div className="space-y-3">
                          <textarea
                            value={draftContent}
                            onChange={(e) => setDraftContent(e.target.value)}
                            rows={22}
                            className="glass-input w-full rounded-xl p-4 text-xs font-mono text-zinc-100 leading-relaxed"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditMode(false)}
                              className="glass-pill px-3.5 py-1.5 rounded-full text-xs text-zinc-300 cursor-pointer"
                            >
                              Vazgeç
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              disabled={savingEdit}
                              className="btn-white px-4 py-1.5 text-xs cursor-pointer"
                            >
                              {savingEdit ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                          </div>
                        </div>
                      ) : activeFile.content ? (
                        <>
                          <MarkdownView content={activeFile.content} />
                          {activeFile.status === 'running' && (
                            <span className="inline-block w-2 h-4 ml-1 bg-[#958fff] animate-pulse align-middle rounded-sm" />
                          )}
                        </>
                      ) : (
                        <div className="py-16 text-center text-xs text-zinc-400 flex flex-col items-center gap-2.5">
                          <Loader2 className="w-5 h-5 animate-spin text-[#958fff]" />
                          {activeFile.status === 'pending'
                            ? 'Başlatılıyor...'
                            : `${activeFile.filename} yazılıyor...`}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
