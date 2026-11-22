import type {
  BlueprintAuditIssue,
  DebateRound,
  DebateSession,
  GeneratedMdFile,
  ResponseStatus,
} from '../types.ts';

export interface PhasePromptItem {
  id: string;
  phaseNumber: number;
  label: string;
  title: string;
  prompt: string;
  source: 'extracted' | 'synthesized';
}

export interface PackMermaidItem {
  fileId: string;
  filename: string;
  title: string;
  code: string;
}

export interface RoundHighlightItem {
  seatId: string;
  seatLabel: string;
  provider: string;
  model: string;
  status: ResponseStatus;
  score?: string;
  headline: string;
}

function cleanLineForPreview(raw: string): string {
  return raw
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#+\s+/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts clickable Phase Starter Prompts (`Faz 1`, `Faz 2`, ...) from `05_AGENTS_START_HERE.md`
 * (or `03_AGENTS_EXECUTION_GUIDE.md`) and fills in any remaining phases from `PROJECT_CONTRACT.phases`
 * with 0 LLM tokens! Always returns at least Faz 1 when a pack has generated files.
 */
export function extractPhasePrompts(session: DebateSession): PhasePromptItem[] {
  const files = (session.blueprint?.files || []).filter(
    (f) => f.status === 'done' && f.content.trim().length > 0
  );
  if (files.length === 0) return [];

  const isEn = session.language === 'en';
  const contract = session.blueprint?.contract;
  const agentsFile =
    files.find((f) => /AGENTS|START_HERE|EXECUTION_GUIDE|BRIEF/i.test(f.filename)) ||
    files[files.length - 1];
  const fileNames = files.map((f) => f.filename);
  const readOrder = ['PROJECT_CONTRACT.json', ...fileNames].join(' -> ');

  const extractedByPhase = new Map<number, PhasePromptItem>();

  if (agentsFile) {
    // Match headings mentioning Faz N / Phase N followed by a fenced code block (```text, ```markdown, ```prompt, or ```)
    const sectionRe =
      /(?:^|\n)(?:#{2,4}|\*\*)\s*[^\n]*?(?:Faz|Phase)\s*(\d+)[^\n]*\r?\n(?:(?!#{2,4}\s)[\s\S])*?```(?:[a-zA-Z0-9_-]*)?\r?\n([\s\S]*?)\r?\n```/gi;
    let m: RegExpExecArray | null;
    while ((m = sectionRe.exec(agentsFile.content)) !== null) {
      const phaseNumber = Number(m[1]);
      const blockText = m[2].trim();
      if (!phaseNumber || blockText.length < 40 || extractedByPhase.has(phaseNumber)) continue;
      const contractPhase = contract?.phases?.[phaseNumber - 1];
      extractedByPhase.set(phaseNumber, {
        id: `phase_${phaseNumber}`,
        phaseNumber,
        label: isEn ? `Phase ${phaseNumber}` : `Faz ${phaseNumber}`,
        title: contractPhase
          ? contractPhase.replace(/^(?:Faz|Phase)\s*\d+\s*[:\-–—]?\s*/i, '').trim()
          : isEn
            ? `Phase ${phaseNumber} Prompt`
            : `Faz ${phaseNumber} Başlangıç Promptu`,
        prompt: blockText,
        source: 'extracted',
      });
    }
  }

  // Synthesize missing phases from PROJECT_CONTRACT.phases (up to 5 phases)
  const contractPhases = contract?.phases?.length
    ? contract.phases.slice(0, 5)
    : [isEn ? 'Phase 1: Core Setup & First Working Slice' : 'Faz 1: Proje İskeleti ve İlk Çalışan Dilim'];

  const results: PhasePromptItem[] = [];
  contractPhases.forEach((rawPhase, idx) => {
    const phaseNumber = idx + 1;
    const existing = extractedByPhase.get(phaseNumber);
    if (existing) {
      results.push(existing);
      return;
    }

    const cleanPhaseTitle = rawPhase.replace(/^(?:Faz|Phase)\s*\d+\s*[:\-–—]?\s*/i, '').trim() || rawPhase;
    const isEvo = session.projectMode === 'existing_feature';
    const prompt = isEn
      ? [
          `Read these specification files in exact order before writing code: ${readOrder}.`,
          isEvo
            ? `This is an EXISTING codebase evolution task — preserve existing behavior and tests.`
            : `Follow PROJECT_CONTRACT.json and ${agentsFile.filename} Hard Invariants strictly with zero drift.`,
          ``,
          `Execute ONLY Phase ${phaseNumber}: ${cleanPhaseTitle}.`,
          `Do not implement later phases yet. Before finishing, run all verification/typecheck/test commands defined for Phase ${phaseNumber} and report exact results.`,
        ].join('\n')
      : [
          `Kod yazmaya başlamadan önce bu klasördeki dokümanları şu sırayla eksiksiz oku: ${readOrder}.`,
          isEvo
            ? `Bu bir MEVCUT PROJEYE ÖZELLİK ekleme görevidir — var olan özellikleri ve testleri kesinlikle bozma.`
            : `PROJECT_CONTRACT.json içindeki isimlendirmelere ve ${agentsFile.filename} §3 Hard Invariants kurallarına %100 uy.`,
          ``,
          `YALNIZCA Faz ${phaseNumber} kapsamını eksiksiz inşa et: ${cleanPhaseTitle}.`,
          `Sonraki fazlara geçmeden önce Faz ${phaseNumber} için tanımlı tüm derleme/tip/test doğrulama komutlarını çalıştırıp temiz sonucu raporla.`,
        ].join('\n');

    results.push({
      id: `phase_${phaseNumber}`,
      phaseNumber,
      label: isEn ? `Phase ${phaseNumber}` : `Faz ${phaseNumber}`,
      title: cleanPhaseTitle,
      prompt,
      source: 'synthesized',
    });
  });

  // Also include any higher extracted phases not covered by contractPhases
  for (const [num, item] of extractedByPhase.entries()) {
    if (!results.some((r) => r.phaseNumber === num)) {
      results.push(item);
    }
  }

  return results.sort((a, b) => a.phaseNumber - b.phaseNumber);
}

/**
 * Extracts up to 2 valid Mermaid diagrams from the Blueprint pack (prioritizing UX & Architecture/Migration)
 * for instant visual preview in the `00 · Mimari Özet` dashboard.
 */
export function extractPackMermaidDiagrams(files: GeneratedMdFile[]): PackMermaidItem[] {
  const done = files.filter((f) => f.status === 'done' && f.content.trim().length > 0);
  const prioritized = [...done].sort((a, b) => {
    const score = (fn: string) => {
      if (/UX|DESIGN|SCREEN/i.test(fn)) return 0;
      if (/ARCH|DATA|MIGRATION|DIFF/i.test(fn)) return 1;
      return 2;
    };
    return score(a.filename) - score(b.filename);
  });

  const out: PackMermaidItem[] = [];
  const re = /```mermaid\s*\r?\n([\s\S]*?)\r?\n```/gi;

  for (const file of prioritized) {
    re.lastIndex = 0;
    const match = re.exec(file.content);
    if (match && match[1].trim().length > 12) {
      out.push({
        fileId: file.id,
        filename: file.filename,
        title: file.title,
        code: match[1].trim(),
      });
    }
    if (out.length >= 2) break;
  }

  return out;
}

/**
 * 0-Token Round Summary Strip Extractor:
 * Pulls each agent's `X/10` score (if stated) and crisp 1-line headline takeaway
 * so the user can scan an entire debate round in 3 seconds!
 */
export function extractRoundHighlights(round: DebateRound): RoundHighlightItem[] {
  return round.responses.map((res) => {
    const content = (res.content || '').trim();
    if (!content) {
      return {
        seatId: res.seatId,
        seatLabel: res.seatLabel,
        provider: res.provider,
        model: res.model,
        status: res.status,
        headline:
          res.status === 'running'
            ? 'Yanıt yazılıyor...'
            : res.status === 'error'
              ? res.error || 'Hata oluştu'
              : 'Bekleniyor...',
      };
    }

    // Extract optional X/10 score (e.g. "8.5/10", "9/10", "Puan: 8/10")
    const scoreMatch = content.match(/\b(\d{1,2}(?:[.,]\d)?)\s*\/\s*10\b/);
    const score = scoreMatch ? `${scoreMatch[1].replace(',', '.')}/10` : undefined;

    // Pick first meaningful non-heading, non-fence prose/bullet line
    const lines = content
      .replace(/```[\s\S]*?```/g, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('|'));

    let headline = '';
    for (const line of lines) {
      const cleaned = cleanLineForPreview(line);
      if (cleaned.length >= 24) {
        headline = cleaned;
        break;
      }
    }
    if (!headline && lines[0]) {
      headline = cleanLineForPreview(lines[0]);
    }
    if (headline.length > 135) {
      headline = headline.slice(0, 132).trimEnd() + '…';
    }

    return {
      seatId: res.seatId,
      seatLabel: res.seatLabel,
      provider: res.provider,
      model: res.model,
      status: res.status,
      score,
      headline: headline || 'Analiz tamamlandı.',
    };
  });
}

/**
 * Counts open Lint + AI QA issues per filename so the Blueprint file list can show
 * subtle amber/red indicators right next to files that need attention.
 */
export function collectFileIssueCounts(
  session: DebateSession
): Record<string, { high: number; medium: number; low: number; total: number }> {
  const map: Record<string, { high: number; medium: number; low: number; total: number }> = {};
  const allIssues: BlueprintAuditIssue[] = [
    ...(session.blueprint?.lint?.issues || []),
    ...(session.blueprint?.audit?.issues || []),
  ];

  for (const iss of allIssues) {
    const key = iss.file.trim();
    if (!key) continue;
    if (!map[key]) {
      map[key] = { high: 0, medium: 0, low: 0, total: 0 };
    }
    map[key][iss.severity]++;
    map[key].total++;
  }

  return map;
}
