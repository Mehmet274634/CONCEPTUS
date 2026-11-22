import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  GitBranch,
  Loader2,
  Lock,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { getExportUrl } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import {
  PROVIDER_META,
  type DecisionGate,
  type SynthesisResult,
} from '../types.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface SynthesisCardProps {
  sessionId: string;
  synthesis: SynthesisResult;
  onUpdateDecisionGates: (gates: DecisionGate[]) => void;
  onExtractGates: () => Promise<void>;
  extractingGates: boolean;
  onGoToBlueprint: () => void;
}

export function SynthesisCard({
  sessionId,
  synthesis,
  onUpdateDecisionGates,
  onExtractGates,
  extractingGates,
  onGoToBlueprint,
}: SynthesisCardProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const meta = PROVIDER_META[synthesis.provider];

  const handleCopy = () => {
    navigator.clipboard.writeText(synthesis.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const gates = synthesis.decisionGates || [];
  const highlights = synthesis.evolutionHighlights || [];
  const readiness = synthesis.readinessScore;

  const selectOption = (gateId: string, optionId: string) => {
    const updated = gates.map((g) =>
      g.id === gateId ? { ...g, selectedOptionId: optionId } : g
    );
    onUpdateDecisionGates(updated);
  };

  const updateNote = (gateId: string, customNote: string) => {
    const updated = gates.map((g) =>
      g.id === gateId ? { ...g, customNote } : g
    );
    onUpdateDecisionGates(updated);
  };

  return (
    <div className="space-y-4">
      {/* 0. 5-Axis Idea Readiness Radar Bar */}
      {readiness && (
        <div className="glass-panel rounded-2xl p-4 sm:p-5 border-[#7c74ff]/30">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#cbc7ff]">
              <Sparkles className="w-3.5 h-3.5" />
              {t('Fikir Olgunluk Radarı (5 Eksen)', 'Idea Readiness Radar (5 Axes)')}
            </div>
            <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#4cc58a]/15 text-[#8ae3b7] border border-[#4cc58a]/35">
              {readiness.overall}/100
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {(
              [
                { k: 'problemClarity', tr: 'Problem Netliği', en: 'Problem Clarity', v: readiness.problemClarity },
                { k: 'uxValue', tr: 'UX & Değer', en: 'UX & Value', v: readiness.uxValue },
                { k: 'technicalSolidity', tr: 'Teknik Mimari', en: 'Tech Architecture', v: readiness.technicalSolidity },
                { k: 'securityRisk', tr: 'Güvenlik & Risk', en: 'Security & Risk', v: readiness.securityRisk },
                { k: 'mvpSharpness', tr: 'MVP Keskinliği', en: 'MVP Sharpness', v: readiness.mvpSharpness },
              ] as const
            ).map((axis) => (
              <div
                key={axis.k}
                className="rounded-xl bg-white/[0.025] border border-white/[0.06] px-3 py-2 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-1 text-[10.5px]">
                  <span className="text-zinc-400 truncate">{t(axis.tr, axis.en)}</span>
                  <span className="font-mono text-zinc-200 font-semibold">{axis.v}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7c74ff] to-[#3fd0c9]"
                    style={{ width: `${Math.max(10, Math.min(100, axis.v))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. "Ne Değişti?" Evolution Summary Strip */}
      {highlights.length > 0 && (
        <div className="glass-panel rounded-2xl p-4 sm:p-5 border-[#3fd0c9]/25">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#88ece7] mb-2.5">
            <GitBranch className="w-3.5 h-3.5" />
            {t('Evrim Özeti — Tartışma Neyi İyileştirdi?', 'Evolution Summary — What Did the Debate Improve?')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {highlights.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-xs text-zinc-200 leading-relaxed"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4cc58a] shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Interactive Human Decision Gates (Prominent right above Master Decision!) */}
      {synthesis.status === 'done' && gates.length > 0 && (
        <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4 border-[#7c74ff]/40 bg-gradient-to-b from-[#7c74ff]/[0.07] to-transparent">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-white">
                <Lock className="w-3.5 h-3.5 text-[#958fff]" />
                {t(`İnsan Kararı Kilidi (${gates.length} Yol Ayrımı)`, `Human Decision Gates (${gates.length} Trade-offs)`)}
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {t(
                  'MD dosyaları üretilmeden önce son tercihlerini kilitle — tüm `.md` dosyaları bu seçimlere %100 uyumlu ve sıfır belirsizlikle yazılır.',
                  'Lock your final choices before generating blueprints — every `.md` file will honor these choices with zero ambiguity.'
                )}
              </p>
            </div>
            <button
              onClick={onGoToBlueprint}
              className="btn-white inline-flex items-center gap-1.5 text-xs px-4 py-2 cursor-pointer"
            >
              {t('Seçimleri Kilitle & MD Üret', 'Lock Choices & Build MDs')}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {gates.map((gate, gIdx) => (
              <div
                key={gate.id}
                className="rounded-2xl bg-white/[0.025] border border-white/[0.08] p-4 space-y-2.5"
              >
                <p className="text-xs font-semibold text-zinc-100">
                  {gIdx + 1}. {gate.question}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {gate.options.map((opt) => {
                    const selected = gate.selectedOptionId === opt.id;
                    const isRec = gate.recommendation === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => selectOption(gate.id, opt.id)}
                        className={`text-left rounded-xl p-3 border transition cursor-pointer ${
                          selected
                            ? 'bg-[#7c74ff]/15 border-[#7c74ff]/60 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                            : 'bg-white/[0.02] border-white/[0.07] text-zinc-300 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold flex items-center gap-1.5">
                            <span
                              className={`w-4 h-4 rounded-full text-[10px] font-mono inline-flex items-center justify-center ${
                                selected
                                  ? 'bg-[#f7f8f8] text-[#060709] font-bold'
                                  : 'bg-white/10 text-zinc-300'
                              }`}
                            >
                              {opt.id}
                            </span>
                            {opt.label}
                          </span>
                          {isRec && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#4cc58a]/15 text-[#8ae3b7]">
                              Önerilen
                            </span>
                          )}
                        </div>
                        {opt.tradeoff && (
                          <p className="text-[11px] text-zinc-400 mt-1.5 leading-snug">
                            {opt.tradeoff}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  value={gate.customNote || ''}
                  onChange={(e) => updateNote(gate.id, e.target.value)}
                  placeholder="İsteğe bağlı özel not / ek kısıt..."
                  className="glass-input w-full text-[11px] rounded-xl px-3 py-1.5 text-zinc-200 placeholder:text-zinc-600"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Main Master Decision Card */}
      <div className="glass-panel rounded-3xl overflow-hidden border-[#7c74ff]/30">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-[#7c74ff]/[0.08] via-transparent to-[#3fd0c9]/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#7c74ff]/25 to-[#3fd0c9]/20 border border-white/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#d3d0ff]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Master Karar — Kesinleşmiş En İyi Çözüm
                </h3>
                {synthesis.status === 'running' && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-[#7c74ff]/20 text-[#cbc7ff]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Hazırlanıyor
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
                <span
                  className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${meta.badge}`}
                >
                  {meta.shortName} · {synthesis.model}
                </span>
                {synthesis.fallbackFrom && (
                  <span
                    title={`Kota/limit nedeniyle ${synthesis.fallbackFrom} yerine otomatik yedek model devraldı`}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#f0b44c]/15 text-[#f7cf86] border border-[#f0b44c]/30"
                  >
                    ↻ Yedek
                  </span>
                )}
                {synthesis.durationMs && (
                  <span className="font-mono">
                    {(synthesis.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {synthesis.status === 'done' && gates.length === 0 && (
              <button
                onClick={onExtractGates}
                disabled={extractingGates}
                className="glass-pill inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full text-[#cbc7ff] hover:text-white cursor-pointer disabled:opacity-40"
              >
                {extractingGates ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                Karar Kapılarını Çıkar
              </button>
            )}

            <button
              onClick={handleCopy}
              disabled={!synthesis.content}
              className="glass-pill inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full text-zinc-200 hover:text-white cursor-pointer disabled:opacity-40"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#4cc58a]" />
                  Kopyalandı
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Kopyala
                </>
              )}
            </button>

            <a
              href={getExportUrl(sessionId)}
              download
              className="glass-pill inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full text-zinc-200 hover:text-white"
            >
              <Download className="w-3.5 h-3.5" />
              Rapor (.md)
            </a>

            {synthesis.status === 'done' && (
              <button
                onClick={onGoToBlueprint}
                className="btn-white inline-flex items-center gap-1.5 text-xs px-4 py-1.5 cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Proje MD Paketini Üret
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {synthesis.status === 'error' || synthesis.status === 'aborted' ? (
            <div className="rounded-2xl bg-[#ff7a6e]/10 border border-[#ff7a6e]/25 p-4 flex items-start gap-2.5 text-xs text-[#ffb4ad]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Master Karar tamamlanamadı</p>
                <p className="mt-1 opacity-90">{synthesis.error}</p>
              </div>
            </div>
          ) : synthesis.content ? (
            <MarkdownView content={synthesis.content} />
          ) : (
            <div className="py-12 text-center text-xs text-zinc-400 flex flex-col items-center gap-2.5">
              <Loader2 className="w-5 h-5 animate-spin text-[#958fff]" />
              Hakem model tüm tartışma turlarını sentezliyor...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
