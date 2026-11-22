import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { getExportsDir, getSessionsDir } from './paths.ts';
import type { DebateSession, SessionSummary } from './types.ts';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sessionPath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(getSessionsDir(), `${safeId}.json`);
}

export function slugifyProjectName(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return clean || 'conceptus-proje';
}

export function saveSession(session: DebateSession): void {
  ensureDir(getSessionsDir());
  session.updatedAt = Date.now();
  fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf8');
}

export function loadSession(id: string): DebateSession | null {
  ensureDir(getSessionsDir());
  const file = sessionPath(id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as DebateSession;
  } catch {
    return null;
  }
}

export function deleteSession(id: string): boolean {
  const file = sessionPath(id);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export function listSessions(): SessionSummary[] {
  const sessionsDir = getSessionsDir();
  ensureDir(sessionsDir);
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
  const summaries: SessionSummary[] = [];

  for (const file of files) {
    try {
      const session = JSON.parse(
        fs.readFileSync(path.join(sessionsDir, file), 'utf8')
      ) as DebateSession;
      summaries.push({
        id: session.id,
        title: session.title,
        domain: session.domain,
        roundCount: session.rounds?.length || 0,
        hasSynthesis: Boolean(session.synthesis && session.synthesis.status === 'done'),
        blueprintFileCount:
          session.blueprint?.files.filter((f) => f.status === 'done').length || 0,
        seatCount: session.seats?.filter((s) => s.enabled).length || 0,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      });
    } catch {
      // ignore corrupt files
    }
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function exportSessionMarkdown(session: DebateSession): string {
  const lines: string[] = [
    `# CONCEPTUS Raporu — ${session.title}`,
    ``,
    `- **Tarih:** ${new Date(session.createdAt).toLocaleString('tr-TR')}`,
    `- **Konu Modu:** ${session.domain}`,
    `- **Aktif Ajanlar:** ${session.seats
      .filter((s) => s.enabled)
      .map((s) => `${s.label} (${s.provider} / ${s.model})`)
      .join(' · ')}`,
    ``,
    `## Başlangıç Fikri / Problemi`,
    session.idea,
  ];

  if (session.constraints.trim()) {
    lines.push('', '## Kısıtlar & Hedefler', session.constraints);
  }

  if (session.synthesis && session.synthesis.content) {
    lines.push(
      '',
      '---',
      '',
      `# MASTER KARAR (${session.synthesis.provider} / ${session.synthesis.model})`,
      '',
      session.synthesis.content
    );
  }

  for (const round of session.rounds) {
    lines.push('', '---', '', `# Tur ${round.roundNumber}: ${round.title}`);
    if (round.userGuidance) {
      lines.push('', `> **Kullanıcı Yönlendirmesi:** ${round.userGuidance}`);
    }
    for (const r of round.responses) {
      lines.push(
        '',
        `## ${r.seatLabel} (${r.anonymousId} · ${r.provider} / ${r.model})`,
        r.status === 'done'
          ? r.content
          : `_Durum: ${r.status} ${r.error ? `— ${r.error}` : ''}_`
      );
    }
  }

  return lines.join('\n');
}

function buildBlueprintIndexReadme(session: DebateSession): string {
  const doneFiles = (session.blueprint?.files || []).filter(
    (f) => f.status === 'done' && f.content.trim()
  );
  const rows = doneFiles
    .map((f) => `| \`${f.filename}\` | ${f.title} | ${f.purpose} |`)
    .join('\n');

  const orderedNames = doneFiles.map((f) => `\`${f.filename}\``).join(', ');

  return [
    `# ${session.title} — CONCEPTUS Uygulama Blueprint Paketi`,
    ``,
    `Bu doküman paketi **CONCEPTUS** çoklu-ajan evrim süreci sonucunda kesinleşen **Master Karar** ve kilitli kullanıcı tercihleri temel alınarak üretilmiştir.`,
    ``,
    `## Paket İçeriği`,
    ``,
    `| Dosya | Başlık | Kapsam |`,
    `| :--- | :--- | :--- |`,
    rows,
    `| \`MASTER_DECISION.md\` | Master Karar | Tartışmadan çıkan kesin karar özeti |`,
    ``,
    `## AI Kodlama Ajanıyla Hemen İnşaya Başla`,
    `Kullandığın kodlama ajanına (**Antigravity**, **Claude Code**, **Cursor** veya **Codex**) aşağıdaki hazır talimatı yapıştır:`,
    ``,
    '```text',
    `Bu klasördeki sırayla ${orderedNames} dokümanlarını eksiksiz oku. Özellikle son dosyadaki kırmızı çizgilere (Hard Invariants) ve 02_UX tasarım kurallarına %100 sadık kalarak, 04_BUILD_ROADMAP içindeki Adım 1'den başlayarak projeyi temiz, modüler ve test ederek inşa et.`,
    '```',
  ].join('\n');
}

function buildAgentBridgeMarkdown(session: DebateSession): string {
  const doneFiles = (session.blueprint?.files || []).filter(
    (f) => f.status === 'done' && f.content.trim()
  );
  const orderedList = doneFiles
    .map((f, i) => `${i + 1}. \`${f.filename}\` — ${f.title}`)
    .join('\n');
  const contract = session.blueprint?.contract;
  const invariantsBlock = contract?.hardInvariants?.length
    ? [
        ``,
        `## Kanonik Kırmızı Çizgiler (Hard Invariants)`,
        ...contract.hardInvariants.map((inv) => `- ${inv}`),
      ]
    : [];
  const nonGoalsBlock = contract?.nonGoals?.length
    ? [
        ``,
        `## v1 Kapsam Dışı (Kesinlikle Ekleme)`,
        ...contract.nonGoals.map((ng) => `- ${ng}`),
      ]
    : [];

  return [
    `# AGENTS.md — ${session.title} (CONCEPTUS v5.0 Proje Beyni Köprüsü)`,
    ``,
    `> Bu dosya **Antigravity**, **Claude Code**, **Cursor**, **Codex** ve **Windsurf** kodlama ajanlarının projeyi sıfır belirsizlikle inşa etmesi için CONCEPTUS tarafından otomatik oluşturulmuştur.`,
    ``,
    `## Zorunlu Okuma Sırası`,
    `Kod yazmaya başlamadan önce aşağıdaki dokümanları sırasıyla eksiksiz oku:`,
    ...(contract ? [`0. \`PROJECT_CONTRACT.json\` — Kanonik teknoloji, rota, veri varlığı ve kırmızı çizgi kilidi`] : []),
    orderedList || '1. `01_PRODUCT_VISION.md`..`05_AGENTS_START_HERE.md`',
    ...invariantsBlock,
    ...nonGoalsBlock,
    ``,
    `## Değiştirilemez Çalışma Kuralı`,
    `- **Tek Doğru Kaynak:** Yukarıdaki numaralı \`.md\` dosyaları, \`PROJECT_CONTRACT.json\` ve \`MASTER_DECISION.md\` kilitli mimari sözleşmedir; kafandan yeni framework, ekstra ücretli servis veya kapsam dışı özellik ekleme.`,
    `- **Adım Adım Doğrulama:** Yol haritasındaki her fazı tamamlayıp derleme/test doğrulamasını geçtikten sonra sıradaki faza geç.`,
  ].join('\n');
}

function buildClaudeBridgeMarkdown(session: DebateSession): string {
  const doneFiles = (session.blueprint?.files || []).filter(
    (f) => f.status === 'done' && f.content.trim()
  );
  const contract = session.blueprint?.contract;
  const roadmapName =
    doneFiles.find((f) => /ROADMAP|MIGRATION/i.test(f.filename))?.filename ||
    '04_BUILD_ROADMAP.md';
  return [
    `# CLAUDE.md — ${session.title}`,
    ``,
    `This project's architectural specification was engineered by **CONCEPTUS**.`,
    ``,
    `## Mandatory Context Loading`,
    `Read these canonical specification files in order before planning or writing code:`,
    ...(contract ? [`- @PROJECT_CONTRACT.json`] : []),
    `- @AGENTS.md`,
    ...doneFiles.map((f) => `- @${f.filename} (${f.title})`),
    ...(contract?.hardInvariants?.length
      ? [``, `## Non-Negotiable Hard Invariants`, ...contract.hardInvariants.map((x) => `- ${x}`)]
      : []),
    ...(contract?.nonGoals?.length
      ? [``, `## v1 Non-Goals (Out of Scope)`, ...contract.nonGoals.map((x) => `- ${x}`)]
      : []),
    ``,
    `## Execution Discipline`,
    `- Start in Plan Mode for each phase in \`${roadmapName}\`; implement one phase cleanly at a time.`,
    `- Run every verification command defined in \`${roadmapName}\` before declaring a phase complete.`,
    `- Never introduce dependencies, routes, or entity names that conflict with \`PROJECT_CONTRACT.json\`.`,
  ].join('\n');
}

function buildAntigravityRuleMarkdown(session: DebateSession): string {
  const doneFiles = (session.blueprint?.files || []).filter(
    (f) => f.status === 'done' && f.content.trim()
  );
  const contract = session.blueprint?.contract;
  return [
    `# Antigravity Workspace Rule — ${session.title}`,
    ``,
    `> Generated by **CONCEPTUS** specifically for Antigravity workspace discipline.`,
    ``,
    `## Source of Truth (Read Order)`,
    ...(contract ? [`0. \`PROJECT_CONTRACT.json\` — Canonical stack, entities, shared components, constants & phases`] : []),
    ...doneFiles.map((f, i) => `${i + 1}. \`${f.filename}\` — ${f.title}`),
    ...(contract?.hardInvariants?.length
      ? [``, `## Hard Invariants (Never Violate)`, ...contract.hardInvariants.map((x) => `- ${x}`)]
      : []),
    ...(contract?.nonGoals?.length
      ? [``, `## Out of Scope (v1 Non-Goals)`, ...contract.nonGoals.map((x) => `- ${x}`)]
      : []),
    ``,
    `## Phase Verification Gate`,
    `- Build strictly one locked phase at a time; run typecheck, unit tests, and build verification before moving to the next phase.`,
  ].join('\n');
}

function buildCursorRuleMdc(session: DebateSession): string {
  const doneFiles = (session.blueprint?.files || []).filter(
    (f) => f.status === 'done' && f.content.trim()
  );
  const contract = session.blueprint?.contract;
  return [
    `---`,
    `description: CONCEPTUS Architectural Blueprint Contract for ${session.title}`,
    `globs: ["**/*"]`,
    `alwaysApply: true`,
    `---`,
    ``,
    `# ${session.title} — CONCEPTUS Blueprint Rules`,
    ``,
    `Read \`AGENTS.md\`${contract ? ' and `PROJECT_CONTRACT.json`' : ''} plus:`,
    ...doneFiles.map((f) => `- \`${f.filename}\``),
    ...(contract?.stack?.length ? [``, `## Locked Stack`, ...contract.stack.map((s) => `- ${s}`)] : []),
    ...(contract?.entities?.length
      ? [``, `## Canonical Entities`, ...contract.entities.map((e) => `- \`${e}\``)]
      : []),
    ...(contract?.hardInvariants?.length
      ? [``, `## Hard Invariants`, ...contract.hardInvariants.map((i) => `- ${i}`)]
      : []),
  ].join('\n');
}

export interface BlueprintExportOptions {
  /** Legacy shorthand: if true, includes both CLAUDE.md and .cursor/rules */
  includeIdeRules?: boolean;
  includeClaudeMd?: boolean;
  includeCursorRules?: boolean;
  includeAntigravityRules?: boolean;
}

function resolveExportToolFlags(session: DebateSession, options?: BlueprintExportOptions) {
  const selectedTools = session.targetCodingTools || [];
  const includeClaude =
    options?.includeClaudeMd !== undefined
      ? Boolean(options.includeClaudeMd)
      : options?.includeIdeRules !== undefined
        ? Boolean(options.includeIdeRules)
        : selectedTools.includes('claude_code');
  const includeCursor =
    options?.includeCursorRules !== undefined
      ? Boolean(options.includeCursorRules)
      : options?.includeIdeRules !== undefined
        ? Boolean(options.includeIdeRules)
        : selectedTools.includes('cursor');
  const includeAntigravity =
    options?.includeAntigravityRules !== undefined
      ? Boolean(options.includeAntigravityRules)
      : selectedTools.includes('antigravity');
  return { includeClaude, includeCursor, includeAntigravity };
}

export async function buildBlueprintZipBuffer(
  session: DebateSession,
  options?: BlueprintExportOptions
): Promise<Buffer> {
  if (!session.blueprint || session.blueprint.files.length === 0) {
    throw new Error('Henüz üretilmiş MD paketi yok.');
  }

  // Only include tool-specific bridge files matching the user's chosen coding tools (or explicit export flags)
  const { includeClaude, includeCursor, includeAntigravity } = resolveExportToolFlags(session, options);
  const zip = new JSZip();
  const folderName = slugifyProjectName(session.title);
  const root = zip.folder(folderName)!;

  root.file('README.md', buildBlueprintIndexReadme(session));
  root.file('AGENTS.md', buildAgentBridgeMarkdown(session));

  if (includeAntigravity) {
    root.file('.agents/rules/conceptus-blueprint.md', buildAntigravityRuleMarkdown(session));
  }
  if (includeClaude) {
    root.file('CLAUDE.md', buildClaudeBridgeMarkdown(session));
  }
  if (includeCursor) {
    root.file('.cursor/rules/conceptus-architecture.mdc', buildCursorRuleMdc(session));
  }

  if (session.blueprint.contract?.rawJson) {
    root.file('PROJECT_CONTRACT.json', session.blueprint.contract.rawJson);
  }

  if (session.synthesis?.content) {
    root.file('MASTER_DECISION.md', session.synthesis.content);
  }

  for (const file of session.blueprint.files) {
    if (file.content.trim()) {
      root.file(file.filename, file.content);
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function saveBlueprintToFolder(
  session: DebateSession,
  customDir?: string,
  options?: BlueprintExportOptions
): { folderPath: string; fileCount: number } {
  if (!session.blueprint || session.blueprint.files.length === 0) {
    throw new Error('Kaydedilecek MD paketi bulunamadı.');
  }

  // Only include tool-specific bridge files matching the user's chosen coding tools (or explicit export flags)
  const { includeClaude, includeCursor, includeAntigravity } = resolveExportToolFlags(session, options);
  const folderName = slugifyProjectName(session.title);
  const targetDir = customDir?.trim()
    ? path.resolve(customDir.trim())
    : path.join(getExportsDir(), folderName);

  ensureDir(targetDir);

  let count = 0;
  fs.writeFileSync(
    path.join(targetDir, 'README.md'),
    buildBlueprintIndexReadme(session),
    'utf8'
  );
  count++;

  fs.writeFileSync(
    path.join(targetDir, 'AGENTS.md'),
    buildAgentBridgeMarkdown(session),
    'utf8'
  );
  count++;

  if (includeAntigravity) {
    const agyRulesDir = path.join(targetDir, '.agents', 'rules');
    ensureDir(agyRulesDir);
    fs.writeFileSync(
      path.join(agyRulesDir, 'conceptus-blueprint.md'),
      buildAntigravityRuleMarkdown(session),
      'utf8'
    );
    count++;
  }

  if (includeClaude) {
    fs.writeFileSync(
      path.join(targetDir, 'CLAUDE.md'),
      buildClaudeBridgeMarkdown(session),
      'utf8'
    );
    count++;
  }

  if (includeCursor) {
    const cursorDir = path.join(targetDir, '.cursor', 'rules');
    ensureDir(cursorDir);
    fs.writeFileSync(
      path.join(cursorDir, 'conceptus-architecture.mdc'),
      buildCursorRuleMdc(session),
      'utf8'
    );
    count++;
  }

  if (session.blueprint.contract?.rawJson) {
    fs.writeFileSync(
      path.join(targetDir, 'PROJECT_CONTRACT.json'),
      session.blueprint.contract.rawJson,
      'utf8'
    );
    count++;
  }

  if (session.synthesis?.content) {
    fs.writeFileSync(
      path.join(targetDir, 'MASTER_DECISION.md'),
      session.synthesis.content,
      'utf8'
    );
    count++;
  }

  for (const file of session.blueprint.files) {
    if (file.content.trim()) {
      fs.writeFileSync(path.join(targetDir, file.filename), file.content, 'utf8');
      count++;
    }
  }

  session.blueprint.savedFolderPath = targetDir;
  saveSession(session);
  return { folderPath: targetDir, fileCount: count };
}
