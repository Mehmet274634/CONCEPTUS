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

  return [
    `# AGENTS.md — ${session.title} (CONCEPTUS Proje Köprüsü)`,
    ``,
    `> Bu dosya **Antigravity**, **Claude Code**, **Cursor** ve **Codex** kodlama ajanlarının projeyi sıfır belirsizlikle inşa etmesi için otomatik oluşturulmuştur.`,
    ``,
    `## Zorunlu Okuma Sırası`,
    `Kod yazmaya başlamadan önce aşağıdaki dokümanları sırasıyla eksiksiz oku:`,
    orderedList || '1. `01_PRODUCT_VISION.md`..`05_AGENTS_START_HERE.md`',
    ``,
    `## Değiştirilemez Çalışma Kuralı`,
    `- **Tek Doğru Kaynak:** Yukarıdaki numaralı \`.md\` dosyaları ve \`MASTER_DECISION.md\` kilitli ürün kararlarıdır; kafandan yeni framework, ekstra ücretli servis veya kapsam dışı özellik ekleme.`,
    `- **Adım Adım Doğrulama:** Yol haritasındaki her adımı tamamlayıp derleme/test doğrulaması yaptıktan sonra sıradaki adıma geç.`,
  ].join('\n');
}

export async function buildBlueprintZipBuffer(session: DebateSession): Promise<Buffer> {
  if (!session.blueprint || session.blueprint.files.length === 0) {
    throw new Error('Henüz üretilmiş MD paketi yok.');
  }

  const zip = new JSZip();
  const folderName = slugifyProjectName(session.title);
  const root = zip.folder(folderName)!;

  root.file('README.md', buildBlueprintIndexReadme(session));
  root.file('AGENTS.md', buildAgentBridgeMarkdown(session));

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
  customDir?: string
): { folderPath: string; fileCount: number } {
  if (!session.blueprint || session.blueprint.files.length === 0) {
    throw new Error('Kaydedilecek MD paketi bulunamadı.');
  }

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
