import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  FolderOpen,
  Layers,
  LayoutGrid,
  ListChecks,
  Rocket,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DebateSession, DetectedIde, IdeId } from '../types.ts';
import {
  extractPackMermaidDiagrams,
  extractPhasePrompts,
} from '../utils/blueprintOverview.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface BlueprintOverviewProps {
  session: DebateSession;
  detectedIdes: DetectedIde[];
  savedFolder: string | null;
  savingFolder: boolean;
  onSaveAndCopyPrompt: (promptText: string, label: string) => Promise<void>;
  onOpenInIde: (ide: IdeId | 'explorer') => Promise<void>;
  onSelectFile: (fileId: string) => void;
}

export function BlueprintOverview({
  session,
  detectedIdes,
  savedFolder,
  savingFolder,
  onSaveAndCopyPrompt,
  onOpenInIde,
  onSelectFile,
}: BlueprintOverviewProps) {
  const contract = session.blueprint?.contract;
  const files = session.blueprint?.files || [];
  const doneFiles = useMemo(
    () => files.filter((f) => f.status === 'done' && f.content.trim().length > 0),
    [files]
  );

  const phasePrompts = useMemo(() => extractPhasePrompts(session), [session]);
  const mermaidDiagrams = useMemo(() => extractPackMermaidDiagrams(files), [files]);

  const [activePhaseId, setActivePhaseId] = useState<string>(phasePrompts[0]?.id || 'phase_1');
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openingIde, setOpeningIde] = useState<string | null>(null);

  const activePhase =
    phasePrompts.find((p) => p.id === activePhaseId) || phasePrompts[0] || null;

  const totalKB = useMemo(() => {
    const bytes = doneFiles.reduce((acc, f) => acc + new Blob([f.content]).size, 0);
    return (bytes / 1024).toFixed(1);
  }, [doneFiles]);

  const lintScore = session.blueprint?.lint?.score;
  const auditScore = session.blueprint?.audit?.score;
  const isEvo = session.projectMode === 'existing_feature';
  const installedIdes = detectedIdes.filter((i) => i.installed);

  async function handlePrimaryHandoff() {
    if (!activePhase) return;
    await onSaveAndCopyPrompt(activePhase.prompt, activePhase.label);
    setCopiedId(activePhase.id);
    setTimeout(() => setCopiedId(null), 2400);
  }

  async function handleCopyOnly() {
    if (!activePhase) return;
    await navigator.clipboard.writeText(activePhase.prompt);
    setCopiedId(`${activePhase.id}_copy`);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleOpenIdeClick(ide: IdeId | 'explorer') {
    setOpeningIde(ide);
    try {
      await onOpenInIde(ide);
    } finally {
      setTimeout(() => setOpeningIde(null), 900);
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. Primary 1-Click Handoff Card — Close the Last Mile */}
      {activePhase && (
        <div className="rounded-2xl border border-zinc-800/90 bg-gradient-to-br from-[#0f1018] via-[#0b0c12] to-[#0a0b10] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/12 text-emerald-300">
                  <Rocket className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-[14px] font-semibold tracking-tight text-zinc-100">
                  {isEvo
                    ? 'Mevcut Projede Uygulamaya Hazır'
                    : 'İnşaya Hazır — Son 1 Metreyi Kapat'}
                </h3>
                {isEvo && (
                  <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                    Mevcut Proje Modu
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-zinc-400">
                {savedFolder
                  ? 'Dosyalar hedef klasöre kaydedildi. Aşağıdan fazını seçip promptu kopyala ve doğrudan IDE’nde aç.'
                  : 'Tek tıkla temiz MD paketini klasöre kaydet ve seçili fazın başlangıç promptunu panoya kopyala.'}
              </p>
            </div>

            {/* Phase Selector Tabs */}
            {phasePrompts.length > 1 && (
              <div className="inline-flex flex-wrap items-center rounded-xl border border-zinc-800 bg-zinc-950/90 p-0.5">
                {phasePrompts.map((p) => {
                  const active = p.id === activePhase.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActivePhaseId(p.id)}
                      title={p.title}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                        active
                          ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active phase title */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-zinc-300">
            <span className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-[10.5px] text-emerald-300">
              {activePhase.label}
            </span>
            <span className="truncate text-zinc-300">{activePhase.title}</span>
          </div>

          {/* Primary Action + IDE Launchers */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handlePrimaryHandoff()}
              disabled={savingFolder}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-[12.5px] font-semibold text-zinc-950 shadow-sm transition-all hover:bg-white disabled:opacity-60"
            >
              {copiedId === activePhase.id ? (
                <Check className="h-3.5 w-3.5 text-emerald-700" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {savingFolder
                ? 'Kaydediliyor...'
                : copiedId === activePhase.id
                  ? savedFolder
                    ? `${activePhase.label} Kopyalandı`
                    : `Kaydedildi & ${activePhase.label} Kopyalandı`
                  : savedFolder
                    ? `${activePhase.label} Promptunu Kopyala`
                    : `Kaydet & ${activePhase.label} Promptunu Kopyala`}
            </button>

            {!savedFolder && (
              <button
                onClick={() => void handleCopyOnly()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/90 px-3 py-2 text-[11.5px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
              >
                {copiedId === `${activePhase.id}_copy` ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                )}
                Sadece Kopyala
              </button>
            )}

            {/* Open in Detected IDEs once folder is saved */}
            {savedFolder && (
              <>
                <span className="mx-1 hidden h-4 w-px bg-zinc-800 sm:inline-block" />
                {installedIdes.map((ide) => (
                  <button
                    key={ide.id}
                    onClick={() => void handleOpenIdeClick(ide.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[11.5px] font-medium text-indigo-200 transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/20"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    {openingIde === ide.id ? 'Açılıyor...' : `${ide.name}’de Aç`}
                    <ArrowUpRight className="h-3 w-3 opacity-70" />
                  </button>
                ))}
                <button
                  onClick={() => void handleOpenIdeClick('explorer')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/90 px-3 py-2 text-[11.5px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-zinc-400" />
                  Klasörü Aç
                </button>
              </>
            )}

            <button
              onClick={() => setShowPromptPreview((v) => !v)}
              className="ml-auto inline-flex items-center gap-1 rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
            >
              Promptu Gör
              {showPromptPreview ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {savedFolder && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="truncate font-mono text-zinc-400">{savedFolder}</span>
            </div>
          )}

          {showPromptPreview && (
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-300">
              {activePhase.prompt}
            </pre>
          )}
        </div>
      )}

      {/* 2. Compact Architectural Metrics Strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <MetricPill
          label="MD Dosyası"
          value={`${doneFiles.length}/${files.length}`}
          sub={`${totalKB} KB`}
        />
        <MetricPill
          label="Teknoloji"
          value={String(contract?.stack?.length || 0)}
          sub="Kilitli yığın"
        />
        <MetricPill
          label="Varlık / Ekran"
          value={`${contract?.entities?.length || 0} / ${contract?.routes?.length || 0}`}
          sub="Veri · Rota"
        />
        <MetricPill
          label="0-Token Lint"
          value={lintScore !== undefined ? `${lintScore}/100` : '—'}
          sub={
            session.blueprint?.lint
              ? `${session.blueprint.lint.passedChecks}/${session.blueprint.lint.totalChecks} kontrol`
              : 'Bekliyor'
          }
          accent={
            lintScore !== undefined
              ? lintScore >= 90
                ? 'emerald'
                : lintScore >= 75
                  ? 'amber'
                  : 'rose'
              : undefined
          }
        />
        <MetricPill
          label="AI QA Skoru"
          value={auditScore !== undefined ? `${auditScore}/100` : 'Opsiyonel'}
          sub={
            session.blueprint?.audit
              ? `${session.blueprint.audit.issues.length} bulgu`
              : 'Kalite denetimi'
          }
          accent={
            auditScore !== undefined
              ? auditScore >= 85
                ? 'emerald'
                : auditScore >= 70
                  ? 'amber'
                  : 'rose'
              : undefined
          }
        />
      </div>

      {/* 3. Structured Canonical Contract Cards */}
      {contract ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Tech Stack & Folder Tree */}
          <div className="rounded-2xl border border-zinc-800/80 bg-[#0b0c10] p-4">
            <div className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              Teknoloji Yığını & Klasörler
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contract.stack.map((item, i) => (
                <span
                  key={i}
                  className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11.5px] font-medium text-indigo-200"
                >
                  {item}
                </span>
              ))}
            </div>
            {contract.folderTree.length > 0 && (
              <div className="mt-3.5 border-t border-zinc-800/70 pt-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Klasör Ağacı
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contract.folderTree.map((dir, i) => (
                    <span
                      key={i}
                      className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-300"
                    >
                      {dir}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Canonical Entities & Shared Components */}
          <div className="rounded-2xl border border-zinc-800/80 bg-[#0b0c10] p-4">
            <div className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              Kanonik Varlıklar & UI Bileşenleri
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contract.entities.map((ent, i) => (
                <span
                  key={i}
                  className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1 font-mono text-[11px] text-emerald-200"
                >
                  {ent}
                </span>
              ))}
            </div>
            {contract.sharedComponents && contract.sharedComponents.length > 0 && (
              <div className="mt-3.5 border-t border-zinc-800/70 pt-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Paylaşımlı Bileşenler
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contract.sharedComponents.map((comp, i) => (
                    <span
                      key={i}
                      className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-300"
                    >
                      {comp}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Locked Build Phases */}
          {contract.phases && contract.phases.length > 0 && (
            <div className="rounded-2xl border border-zinc-800/80 bg-[#0b0c10] p-4">
              <div className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400">
                <ListChecks className="h-3.5 w-3.5 text-sky-400" />
                Kilitli İnşa Fazları
              </div>
              <ol className="space-y-2">
                {contract.phases.map((phase, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 rounded-xl border border-zinc-800/60 bg-zinc-950/60 px-3 py-2 text-[12px] text-zinc-200"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-500/15 font-mono text-[10px] font-bold text-sky-300">
                      {idx + 1}
                    </span>
                    <span className="leading-snug">{phase}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Routes / Screens */}
          {contract.routes.length > 0 && (
            <div className="rounded-2xl border border-zinc-800/80 bg-[#0b0c10] p-4">
              <div className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400">
                <LayoutGrid className="h-3.5 w-3.5 text-violet-400" />
                Ekranlar & Rotalar
              </div>
              <ul className="space-y-1.5">
                {contract.routes.map((route, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-zinc-800/60 bg-zinc-950/60 px-3 py-1.5 font-mono text-[11.5px] text-zinc-300"
                  >
                    {route}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Hard Invariants & Non-Goals */}
          {(contract.hardInvariants.length > 0 || contract.nonGoals.length > 0) && (
            <div className="rounded-2xl border border-zinc-800/80 bg-[#0b0c10] p-4 lg:col-span-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {contract.hardInvariants.length > 0 && (
                  <div>
                    <div className="mb-2.5 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-amber-300">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Hard Invariants (Kırmızı Çizgiler)
                    </div>
                    <ul className="space-y-1.5">
                      {contract.hardInvariants.map((rule, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-300"
                        >
                          <AlertTriangle className="mt-1 h-3 w-3 shrink-0 text-amber-400/80" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {contract.nonGoals.length > 0 && (
                  <div>
                    <div className="mb-2.5 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400">
                      <Ban className="h-3.5 w-3.5 text-zinc-500" />
                      Kapsam Dışı (v1 Non-Goals)
                    </div>
                    <ul className="space-y-1.5">
                      {contract.nonGoals.map((ng, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-400"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
                          <span>{ng}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800/70 bg-[#0b0c10] p-5 text-[12.5px] text-zinc-400">
          Kanonik proje sözleşmesi (`PROJECT_CONTRACT.json`) henüz üretilmemiş. Sol listeden
          üretilen `.md` dosyalarını inceleyebilirsin.
        </div>
      )}

      {/* 4. Visual Mermaid Architecture & UX Diagrams */}
      {mermaidDiagrams.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400">
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            Görsel Akış & Sistem Diyagramları
          </div>
          <div className="grid grid-cols-1 gap-3">
            {mermaidDiagrams.map((diag) => (
              <div
                key={diag.fileId}
                className="rounded-2xl border border-zinc-800/80 bg-[#0b0c10] p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] font-semibold text-zinc-200">
                      {diag.filename}
                    </span>
                    <span className="text-[11px] text-zinc-500">· {diag.title}</span>
                  </div>
                  <button
                    onClick={() => onSelectFile(diag.fileId)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
                  >
                    Dosyayı Aç
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <MarkdownView content={`\`\`\`mermaid\n${diag.code}\n\`\`\``} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricPill({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: 'emerald' | 'amber' | 'rose';
}) {
  const valColor =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'amber'
        ? 'text-amber-300'
        : accent === 'rose'
          ? 'text-rose-300'
          : 'text-zinc-100';

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-[#0b0c10] px-3.5 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-[16px] font-semibold tracking-tight ${valColor}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10.5px] text-zinc-500">{sub}</div>
    </div>
  );
}
