import type {
  BlueprintAuditIssue,
  BlueprintLintReport,
  DebateSession,
  GeneratedMdFile,
} from './types.ts';

const UNCERTAINTY_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bTBD\b/g, label: 'TBD' },
  { re: /\bTODO\b/g, label: 'TODO' },
  { re: /\bFIXME\b/g, label: 'FIXME' },
  { re: /\bkarar\s+verilecek\b/gi, label: 'karar verilecek' },
  { re: /\bsonra\s+belirlenecek\b/gi, label: 'sonra belirlenecek' },
  { re: /\bto\s+be\s+decided\b/gi, label: 'to be decided' },
  { re: /\[\s*placeholder\s*\]/gi, label: '[placeholder]' },
];

const VALID_MERMAID_HEADER =
  /^\s*(flowchart|graph|sequenceDiagram|erDiagram|stateDiagram(?:-v2)?|classDiagram|xychart-beta|journey|pie|gitGraph)\b/i;

function stripFencedCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, '');
}

function extractMermaidBlocks(md: string): string[] {
  const blocks: string[] = [];
  const re = /```mermaid\s*\r?\n([\s\S]*?)\r?\n```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

function validateMermaidSyntax(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return 'Boş Mermaid diyagram bloğu.';
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  if (lines.length < 2) return 'Mermaid diyagramı eksik veya tek satır.';
  if (!VALID_MERMAID_HEADER.test(lines[0])) {
    return `Geçersiz Mermaid diyagram başlığı: "${lines[0].slice(0, 40)}"`;
  }
  // Check balanced quotes per line (common KaTeX/Mermaid syntax break)
  for (const line of lines.slice(1)) {
    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      return `Mermaid satırında kapatılmamış tırnak: "${line.slice(0, 50)}"`;
    }
  }
  return null;
}

/**
 * 0-Token Deterministic Local Blueprint Validator (<15ms).
 * Catches mechanical, structural, Mermaid, uncertainty, and canonical-contract issues
 * BEFORE spending a single LLM token on AI QA!
 */
export function lintBlueprintPack(session: DebateSession): BlueprintLintReport {
  const issues: BlueprintAuditIssue[] = [];
  const files: GeneratedMdFile[] = (session.blueprint?.files || []).filter(
    (f) => f.status === 'done' && f.content.trim().length > 0
  );

  let totalChecks = 0;
  let passedChecks = 0;
  let issueIdx = 1;

  const pushIssue = (partial: Omit<BlueprintAuditIssue, 'id'>) => {
    issues.push({ id: `lint_${issueIdx++}`, ...partial });
  };

  // 1. Failed / Missing files check
  totalChecks++;
  const allPackFiles = session.blueprint?.files || [];
  const failedFiles = allPackFiles.filter((f) => f.status !== 'done' || !f.content.trim());
  if (failedFiles.length > 0) {
    pushIssue({
      severity: 'high',
      file: failedFiles[0].filename,
      description: `${failedFiles.length} adet MD dosyası tamamlanmamış (${failedFiles.map((f) => f.filename).join(', ')}).`,
      fixInstruction: 'Eksik/hatalı dosyaları tek tıkla tamamla.',
    });
  } else if (allPackFiles.length > 0) {
    passedChecks++;
  }

  // 2. Per-file structural, depth, uncertainty & Mermaid checks
  for (const file of files) {
    const content = file.content.trim();
    const upper = file.filename.toUpperCase();

    // Check A: H1 Heading
    totalChecks++;
    if (!/^#\s+\S+/m.test(content)) {
      pushIssue({
        severity: 'low',
        file: file.filename,
        description: `${file.filename} dosyası standart bir \`# Başlık\` (H1) ile başlamıyor.`,
        fixInstruction: 'Dosyanın en başına net bir `# ...` H1 başlığı ekle.',
      });
    } else {
      passedChecks++;
    }

    // Check B: Minimum substance density (avoid truncated or stub outputs)
    totalChecks++;
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount < 180) {
      pushIssue({
        severity: 'high',
        file: file.filename,
        description: `${file.filename} çok kısa (${wordCount} kelime); eksik veya yarım kalmış olabilir.`,
        fixInstruction: 'Dosyayı projenin teknik kapsamına uygun somut kurallar ve tablolarla yeniden üret.',
      });
    } else {
      passedChecks++;
    }

    // Check C: Uncertainty / TBD / TODO leakage outside code fences
    // Ignore lines that explicitly PROHIBIT TBDs/TODOs (e.g. "TBD veya TODO eklenemez")
    totalChecks++;
    const PROHIBITION_LINE_RE =
      /eklenemez|bırakma|bırakılamaz|yasaktır|yasak|kullanma|olamaz|içeremez|never\s+leave|do\s+not\s+leave|must\s+not|prohibited|forbidden/i;
    const proseLines = stripFencedCode(content)
      .split(/\r?\n/)
      .filter((line) => !PROHIBITION_LINE_RE.test(line))
      .join('\n');
    const hits: string[] = [];
    for (const p of UNCERTAINTY_PATTERNS) {
      p.re.lastIndex = 0;
      if (p.re.test(proseLines)) hits.push(p.label);
    }
    if (hits.length > 0) {
      pushIssue({
        severity: 'medium',
        file: file.filename,
        description: `${file.filename} içinde kesinleştirilmemiş belirsiz ifadeler var: ${hits.join(', ')}.`,
        fixInstruction: `Tüm "${hits.join(', ')}" ifadelerini kilitli Master Karar doğrultusunda kesin karara bağla.`,
      });
    } else {
      passedChecks++;
    }

    // Check D: Mermaid syntax validation (and required presence on 02_UX & 03_ARCH)
    const mermaidBlocks = extractMermaidBlocks(content);
    const requiresMermaid =
      (session.domain === 'app_product' || session.domain === 'tech_project') &&
      (/UX|DESIGN|SCREEN|ARCH|DATA|SCHEMA|MIGRATION|DIFF/.test(upper));

    if (requiresMermaid || mermaidBlocks.length > 0) {
      totalChecks++;
      if (requiresMermaid && mermaidBlocks.length === 0) {
        pushIssue({
          severity: 'medium',
          file: file.filename,
          description: `${file.filename} dosyasında görsel akış/mimari için beklenen \`\`\`mermaid diyagramı eksik.`,
          fixInstruction: 'Geçerli ve sade bir ```mermaid diyagramı (flowchart LR veya erDiagram) ekle.',
        });
      } else {
        const syntaxErr = mermaidBlocks.map(validateMermaidSyntax).find(Boolean);
        if (syntaxErr) {
          pushIssue({
            severity: 'high',
            file: file.filename,
            description: `${file.filename} içindeki Mermaid diyagramında sözdizimi hatası: ${syntaxErr}`,
            fixInstruction: 'Mermaid bloğunu geçerli flowchart/erDiagram sözdizimi ve dengeli tırnaklarla düzelt.',
          });
        } else {
          passedChecks++;
        }
      }
    }

    // Check E: Context-window budget guard (prevent bloated >38KB files or >22KB handoff briefs)
    const sizeKB = Buffer.byteLength(content, 'utf8') / 1024;
    const isHandoff = /AGENTS|START_HERE|BRIEF/.test(upper);
    totalChecks++;
    if (isHandoff && sizeKB > 22) {
      pushIssue({
        severity: 'low',
        file: file.filename,
        description: `${file.filename} fazla şişkin (${sizeKB.toFixed(1)} KB); Hard Invariants tekrar kopyalanmış olabilir.`,
        fixInstruction: 'Hard Invariants listesini yalnızca 1 kez yaz, başlangıç promptlarını kısa referanslarla sadeleştir.',
      });
    } else if (!isHandoff && sizeKB > 38) {
      pushIssue({
        severity: 'low',
        file: file.filename,
        description: `${file.filename} çok büyük (${sizeKB.toFixed(1)} KB); kodlama ajanının bağlam penceresini gereksiz doldurabilir.`,
        fixInstruction: 'Diğer dosyalarda tanımlı tekrar listeleri silip yalnızca bu dosyanın çekirdek sorumluluğunu tut.',
      });
    } else {
      passedChecks++;
    }
  }

  // 3. Canonical PROJECT_CONTRACT consistency checks across the whole pack
  const contract = session.blueprint?.contract;
  const agentsFile = files.find((f) => /AGENTS|START_HERE|BRIEF/i.test(f.filename));
  const roadmapFile = files.find((f) => /ROADMAP|ACTION|PLAYBOOK/i.test(f.filename));
  const uxFile = files.find((f) => /UX|DESIGN|SCREEN/i.test(f.filename));
  const archFile = files.find((f) => /ARCH|DATA|SCHEMA/i.test(f.filename));

  if (contract && files.length > 0) {
    const fullPackLower = files.map((f) => f.content).join('\n').toLowerCase();

    if (contract.entities.length > 0) {
      totalChecks++;
      const missingEntities = contract.entities.filter(
        (ent) => ent.trim().length >= 3 && !fullPackLower.includes(ent.trim().toLowerCase())
      );
      if (missingEntities.length > Math.ceil(contract.entities.length * 0.4)) {
        pushIssue({
          severity: 'medium',
          file: '03_ARCHITECTURE_AND_DATA.md',
          conflictWith: 'PROJECT_CONTRACT.json',
          description: `Kanonik sözleşmedeki bazı veri varlıkları MD dosyalarında eksik: ${missingEntities.slice(0, 4).join(', ')}.`,
          fixInstruction: '03_ARCHITECTURE_AND_DATA.md içine kanonik sözleşmedeki tüm veri varlıklarını birebir adlarıyla ekle.',
        });
      } else {
        passedChecks++;
      }
    }

    if (contract.sharedComponents && contract.sharedComponents.length > 0 && uxFile && archFile) {
      totalChecks++;
      const uxLower = uxFile.content.toLowerCase();
      const archLower = archFile.content.toLowerCase();
      const missingInBoth = contract.sharedComponents.filter(
        (c) => c.trim().length >= 3 && !uxLower.includes(c.trim().toLowerCase()) && !archLower.includes(c.trim().toLowerCase())
      );
      if (missingInBoth.length > Math.ceil(contract.sharedComponents.length * 0.5)) {
        pushIssue({
          severity: 'medium',
          file: uxFile.filename,
          conflictWith: archFile.filename,
          description: `Kanonik UI bileşen adları UX/Mimari dosyalarında kullanılmamış: ${missingInBoth.slice(0, 4).join(', ')}.`,
          fixInstruction: '02_UX ve 03_ARCH dosyalarında PROJECT_CONTRACT.json içindeki bileşen adlarını birebir kullan.',
        });
      } else {
        passedChecks++;
      }
    }

    if (contract.hardInvariants.length > 0) {
      totalChecks++;
      if (!agentsFile || !/invariant|kırmızı çizgi|değiştirilemez|kurallar|must not|never/i.test(agentsFile.content)) {
        pushIssue({
          severity: 'medium',
          file: agentsFile?.filename || '05_AGENTS_START_HERE.md',
          conflictWith: 'PROJECT_CONTRACT.json',
          description: 'Başlangıç talimatı dosyasında değiştirilemez kurallar (Hard Invariants) açıkça vurgulanmamış.',
          fixInstruction: '05_AGENTS_START_HERE.md içine PROJECT_CONTRACT içindeki tüm Hard Invariants kurallarını net madde listesi olarak ekle.',
        });
      } else {
        passedChecks++;
      }
    }

    // Check F: Reading order sync — 05_AGENTS_START_HERE must reference PROJECT_CONTRACT.json
    if (agentsFile) {
      totalChecks++;
      if (!/PROJECT_CONTRACT\.json/i.test(agentsFile.content)) {
        pushIssue({
          severity: 'low',
          file: agentsFile.filename,
          conflictWith: 'AGENTS.md',
          description: `${agentsFile.filename} okuma sırasında \`PROJECT_CONTRACT.json\` dosyasını referans göstermiyor.`,
          fixInstruction: 'Okuma sırasının en başına `0. PROJECT_CONTRACT.json` adımını ekle.',
        });
      } else {
        passedChecks++;
      }
    }
  }

  // Check G: Cross-file phase alignment between 04_BUILD_ROADMAP.md and 05_AGENTS_START_HERE.md
  if (roadmapFile && agentsFile) {
    const extractPhase2Tokens = (md: string): string[] => {
      const m = md.match(/^#{2,4}\s+[^\n]*(?:Faz|Phase)\s*2\b([^\n]*)/im);
      if (!m) return [];
      return m[1]
        .toLowerCase()
        .replace(/[^a-zçğıöşü0-9\s]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !/kapsam|kapsamı|faz|phase|devam|promptu|uygulama/.test(w));
    };
    const r2 = extractPhase2Tokens(roadmapFile.content);
    const a2 = extractPhase2Tokens(agentsFile.content);
    if (r2.length >= 2 && a2.length >= 2) {
      totalChecks++;
      const overlap = a2.some((tok) => r2.some((rt) => rt.startsWith(tok.slice(0, 4)) || tok.startsWith(rt.slice(0, 4))));
      if (!overlap) {
        pushIssue({
          severity: 'high',
          file: agentsFile.filename,
          conflictWith: roadmapFile.filename,
          description: `${agentsFile.filename} içindeki Faz 2 başlığı ile ${roadmapFile.filename} içindeki Faz 2 kapsamı birbiriyle uyuşmuyor.`,
          fixInstruction: `${agentsFile.filename} dosyasını ${roadmapFile.filename} içindeki gerçek Faz 1 ve Faz 2 başlıklarıyla birebir hizala.`,
        });
      } else {
        passedChecks++;
      }
    }
  }

  // Compute weighted score (high: -14, medium: -7, low: -3)
  let penalty = 0;
  for (const iss of issues) {
    penalty += iss.severity === 'high' ? 14 : iss.severity === 'medium' ? 7 : 3;
  }
  const score = files.length === 0 ? 0 : Math.max(25, Math.min(100, 100 - penalty));

  return {
    score,
    passedChecks,
    totalChecks: Math.max(1, totalChecks),
    checkedAt: Date.now(),
    issues,
  };
}
