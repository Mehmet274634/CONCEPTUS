import type {
  BlueprintAuditIssue,
  BlueprintDepth,
  BlueprintFileSpec,
  DebateRound,
  DebateSession,
  DomainMode,
  GeneratedMdFile,
  SeatConfig,
  SeatRole,
} from './types.ts';

const DOMAIN_LENS: Record<DomainMode, { label: string; criteria: string }> = {
  app_product: {
    label: 'Uygulama / Ürün Fikri',
    criteria:
      'Gerçek kullanıcı problemi, pazarda net farklılaşma, sürtünmesiz UX, tutundurma (retention), ilk MVP kapsamı, gelir modeli ve teknik uygulanabilirlik.',
  },
  tech_project: {
    label: 'Teknik Proje / Mimari',
    criteria:
      'En sade sürdürülebilir mimari, performans, ölçeklenebilirlik, güvenlik, bakım maliyeti, entegrasyon riskleri ve geliştirme hızı.',
  },
  problem_solving: {
    label: 'Sorun & Problem Çözme',
    criteria:
      'Semptom yerine gerçek kök neden, en yüksek kaldıraçlı çözüm, ikinci dereceden yan etkiler, zaman/maliyet dengesi ve ölçülebilir doğrulama.',
  },
  strategy_general: {
    label: 'Strateji / İş & Genel Fikir',
    criteria:
      'Fırsat maliyeti, rekabet avantajı, alternatif yollar, risk/getiri dengesi ve net karar kriterleri.',
  },
};

const ROLE_INSTRUCTIONS: Record<Exclude<SeatRole, 'custom'>, string> = {
  general:
    'ROLÜN: Çok Yönlü Kıdemli Uzman (Genel Mod). Tek bir önyargıya saplanmadan; ürün, teknik, kullanıcı, risk ve uygulama boyutlarının tamamını dengeli ve en yüksek kalitede değerlendir.',
  chief_architect:
    'ROLÜN: Baş Sistem Mimarı. En temiz, en hızlı, en sürdürülebilir teknik/yapısal tasarımı kur. Gereksiz karmaşıklığı kes, veri akışı ve entegrasyon sınırlarını netleştir.',
  product_ux:
    'ROLÜN: Ürün & UX Direktörü. Kullanıcının gözünden bak: değer önerisi ilk 10 saniyede anlaşılıyor mu, akış yeterince sade mi, kullanıcıyı geri getirecek gerçek kanca nedir?',
  risk_auditor:
    'ROLÜN: Risk & Güvenlik Denetçisi. Nezaket gösterme; gizli varsayımları, kör noktaları, başarısızlık senaryolarını, maliyet/kota/güvenlik tuzaklarını ortaya çıkar ve her biri için somut çözüm öner.',
  growth_strategist:
    'ROLÜN: İş & Büyüme Stratejisti. Pazar konumu, rakiplerden ayrışma, fiyatlama/gelir mantığı, dağıtım kanalı ve fırsat maliyeti açısından fikri maksimum değere taşı.',
  mvp_pragmatist:
    'ROLÜN: Pragmatik MVP Lideri. Aşırı mühendisliği ve şişkin özellikleri acımasızca buda; en kısa sürede gerçek değer üretecek, ölçülebilir ilk çalışan sürüm planını çıkar.',
  root_cause:
    'ROLÜN: Kök Neden & Problem Çözücü. Yüzeydeki semptomlara değil problemin gerçek kaynağına in; en az eforla en kalıcı etkiyi yaratan sistemik çözümü tasarla.',
};

function getRoleInstruction(seat: SeatConfig): string {
  if (seat.role === 'custom') {
    const title = seat.customRoleTitle?.trim() || 'Özel Uzman';
    const detail = seat.customRolePrompt?.trim();
    return detail
      ? `ROLÜN: ${title}. Özel Yönerge: ${detail}`
      : `ROLÜN: ${title}. Fikri bu uzmanlık perspektifinden derinlemesine analiz et ve en üst seviyeye taşı.`;
  }
  return ROLE_INSTRUCTIONS[seat.role] || ROLE_INSTRUCTIONS.general;
}

function buildBaseContext(session: DebateSession): string {
  const domain = DOMAIN_LENS[session.domain] || DOMAIN_LENS.strategy_general;
  const isEn = session.language === 'en';
  const langRule = isEn
    ? '[OUTPUT LANGUAGE RULE: Write ALL headings, prose, bullet points, tables, diagrams, and JSON string values in crisp, idiomatic, senior-level ENGLISH (even if prompt instructions below are in Turkish).]'
    : '[ÇIKTI DİLİ KURALI: Tüm başlıkları, açıklamaları, tabloları ve JSON metinlerini net, akıcı, profesyonel TÜRKÇE yaz (teknik terimler ve kod/dosya adları standart İngilizce).]';

  const parts: string[] = [
    `[SİSTEM KURALI: Salt-okunur fikir ve doküman üretim modundasın. HİÇBİR araç/tool (dosya yazma, dosya okuma, terminal komutu, web arama vb.) ÇAĞIRMA. Yanıtını YALNIZCA doğrudan saf Markdown metni olarak yaz.]`,
    langRule,
    ``,
    `# CONCEPTUS — FİKİR EVRİM MASASI`,
    `**Konu Modu:** ${domain.label}`,
    `**Değerlendirme Ekseni:** ${domain.criteria}`,
    ``,
    `## KULLANICININ FİKRİ / PROBLEMİ`,
    session.idea.trim(),
  ];

  if (session.constraints.trim()) {
    parts.push('', '## KISITLAR & HEDEFLER', session.constraints.trim());
  }

  if (session.contextText.trim()) {
    parts.push('', '## EK BAĞLAM / DOKÜMAN', session.contextText.trim());
  }

  return parts.join('\n');
}

function styleInstruction(seat: SeatConfig, lang: 'tr' | 'en' = 'tr'): string {
  const langName = lang === 'en' ? 'English' : 'Türkçe';
  if (seat.economyMode) {
    return `\n**HIZLI & EKONOMİK MOD:** En fazla 220–260 kelime, madde madde, ultra yoğun ve keskin ${langName} Markdown yaz.`;
  }
  return `\n**ÜSLUP:** Net, keskin, profesyonel ${langName} Markdown (450–650 kelime). Boş övgü ve uzun giriş cümleleri yasak; her cümle somut değer taşısın.`;
}

export function buildRound1Prompt(session: DebateSession, seat: SeatConfig): string {
  return [
    buildBaseContext(session),
    '',
    '---',
    `## GÖREV — TUR 1: BAĞIMSIZ FİKİR VE ULTRA GELİŞTİRME`,
    getRoleInstruction(seat),
    'Diğer ajanların yanıtlarını görmüyorsun. Fikri/problemi en yüksek seviyeye taşımak için tam olarak bu başlıklarla yaz:',
    '',
    '### 1. Geliştirilmiş En İyi Fikir / Çözüm',
    'Mevcut fikri çok daha keskin, güçlü ve uygulanabilir bir üst versiyona taşı.',
    '',
    '### 2. En Güçlü 3 Artı',
    'Somut gerekçeleriyle en yüksek değerli 3 yön.',
    '',
    '### 3. En Kritik 3 Eksi / Kör Nokta + Çözümü',
    'Sistemi zayıflatacak veya başarısız kılacak 3 ana risk ve kısa çözüm önerisi.',
    '',
    '### 4. Alternatif Daha Akıllı Yöntem',
    'Aynı sonuca daha temiz, hızlı veya güçlü ulaşacak alternatif yaklaşım.',
    '',
    '### 5. Skor',
    '`X/10` — Tek cümlelik dürüst gerekçe.',
    styleInstruction(seat, session.language),
  ].join('\n');
}

function summarizeRound(
  round: DebateRound,
  excludeSeatId?: string,
  maxCharsPerSeat = 2800
): string {
  const valid = round.responses.filter(
    (r) => r.status === 'done' && r.content.trim().length > 0
  );
  if (valid.length === 0) return '_Bu turdan geçerli yanıt yok._';

  return valid
    .map((r) => {
      const isSelf = excludeSeatId && r.seatId === excludeSeatId;
      const header = isSelf
        ? `### ${r.anonymousId} (SENİN ÖNCEKİ GÖRÜŞÜN)`
        : `### ${r.anonymousId}`;
      const body =
        r.content.length > maxCharsPerSeat
          ? r.content.slice(0, maxCharsPerSeat) + '\n...[özetlendi]'
          : r.content;
      return `${header}\n${body}`;
    })
    .join('\n\n---\n\n');
}

export function buildCrossDebatePrompt(
  session: DebateSession,
  seat: SeatConfig,
  previousRound: DebateRound,
  newRoundNumber: number,
  userGuidance?: string
): string {
  const guidanceBlock = userGuidance?.trim()
    ? `\n\n## KULLANICININ YÖNLENDİRMESİ (ÖNCELİKLİ)\n> ${userGuidance.trim()}\n`
    : '';

  return [
    buildBaseContext(session),
    guidanceBlock,
    '',
    '---',
    `## ÖNCEKİ TURUN (TUR ${previousRound.roundNumber}) ANONİM FİKİRLERİ`,
    summarizeRound(previousRound, seat.id, 2800),
    '',
    '---',
    `## GÖREV — TUR ${newRoundNumber}: ÇAPRAZ TARTIŞMA VE EVRİM (v${newRoundNumber})`,
    getRoleInstruction(seat),
    'Amaç egonu savunmak değil; masadaki en iyi parçaları birleştirip zayıf varsayımları eleyerek **en üst düzey çözüme** ulaşmak. Tam olarak şu başlıkları kullan:',
    '',
    '### 1. Diğer Ajanlardan Alınacak En Değerli Parçalar',
    'Diğer adayların (`Ajan A`, `Ajan B`...) yakaladığı ve final çözüme mutlaka girmesi gereken noktalar.',
    '',
    '### 2. Çürütülen Varsayımlar & Somut İtirazlar',
    'Diğer adaylardaki zayıf, riskli veya gereksiz karmaşık noktalar (aday adı ve gerekçeyle).',
    '',
    '### 3. Kendi Görüşümde Güncellediğim Noktalar',
    'Diğer analizleri görünce değiştirdiğin kararlar.',
    '',
    `### 4. Evrimleşmiş Çözüm (v${newRoundNumber}) ve Güncel Artı / Eksi`,
    'Tüm güçlü yanları birleştiren, açıkları kapatılmış yeni çözüm ve net Artı/Eksi listesi.',
    styleInstruction(seat, session.language),
  ].join('\n');
}

export function buildMasterSynthesisPrompt(session: DebateSession): string {
  // Smart Context Pruning for Speed: keep full latest round, compact earlier rounds!
  const totalRounds = session.rounds.length;
  const roundsSummary = session.rounds
    .map((round, idx) => {
      const isLatest = idx === totalRounds - 1;
      const cap = isLatest ? 3000 : 1100;
      const guidance = round.userGuidance
        ? `\n> **Kullanıcı Yönlendirmesi:** ${round.userGuidance}\n`
        : '';
      return `## TUR ${round.roundNumber}: ${round.title}${guidance}\n\n${summarizeRound(round, undefined, cap)}`;
    })
    .join('\n\n====================================\n\n');

  return [
    buildBaseContext(session),
    '',
    '---',
    '# TARTIŞMA ARŞİVİ (SON TUR TAM, ÖNCEKİ TURLAR ÖZET)',
    roundsSummary,
    '',
    '---',
    '# GÖREV — CONCEPTUS MASTER KARAR (KESİNLEŞMİŞ EN İYİ FİKİR & ÇÖZÜM)',
    'Sen tarafsız **Baş Hakem ve Baş Mimar**sın. En sağlam kanıta, en yüksek değere ve en temiz uygulanabilir çözüme ağırlık ver. Keskin, yoğun ve doğrudan uygulanabilir yaz (~1.100–1.700 kelime, gereksiz uzatma yok).',
    '',
    'Tam olarak şu başlıklarla Türkçe Markdown üret:',
    '',
    '## 1. Nihai Master Fikir / Çözüm (Ultra Versiyon)',
    'İlk ham fikirden hangi kesin ve üst seviyeye evrildiğini net biçimde tanımla.',
    '',
    '## 2. Seçilen En İyi Yöntem & Karar Matrisi',
    'Kazanan yaklaşım ve elenen alternatifleri kısa bir Markdown tablosunda gerekçeleriyle karşılaştır.',
    '',
    '## 3. Kesinleşen Mimari / Yapı ve Kapsam (MVP vs. Sonraki Fazlar)',
    'İlk aşamada neyin yapılacağını ve neyin kesinlikle kapsam dışı bırakılacağını net ayır.',
    '',
    '## 4. Birleştirilen Artılar & Çözülen Kör Noktalar',
    'Tartışmada yakalanıp çözülen kritik açıklar.',
    '',
    '## 5. Kalan Riskler ve Tedbirler',
    'Hâlâ dikkat edilmesi gereken en kritik riskler ve somut tedbirleri.',
    '',
    '## 6. İlk 3 Somut Aksiyon Adımı',
    'Hemen bugün uygulanabilecek, sıralı, ölçülebilir ilk 3 adım.',
    '',
    '---',
    '**ZORUNLU YAPISAL ÖZET BLOĞU (EN SONA EKLE):**',
    'Yanıtının EN SONUNA tam olarak aşağıdaki etiketle tek bir geçerli JSON bloğu ekle (başka hiçbir metin ekleme):',
    '```conceptus-meta',
    '{',
    '  "evolutionHighlights": [',
    '    "İlk fikirden tartışma sayesinde yakalanan ve değiştirilen kritik iyileştirme #1 (tek net cümle)",',
    '    "Kritik iyileştirme #2",',
    '    "Kritik iyileştirme #3"',
    '  ],',
    '  "decisionGates": [',
    '    {',
    '      "id": "gate_1",',
    '      "question": "MD üretimi öncesi kullanıcının kesinleştirmesi gereken stratejik yol ayrımı sorusu",',
    '      "recommendation": "A",',
    '      "options": [',
    '        { "id": "A", "label": "Seçenek A (kısa başlık)", "tradeoff": "Artı / eksi tek cümle" },',
    '        { "id": "B", "label": "Seçenek B (kısa başlık)", "tradeoff": "Artı / eksi tek cümle" }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '```',
    '*(Not: `decisionGates` içinde 2 ila 3 adet gerçekten kritik insan kararı koy; `evolutionHighlights` içinde 3 ila 4 keskin madde ver.)*',
  ].join('\n');
}

export function buildExtractGatesPrompt(session: DebateSession): string {
  const master = session.synthesis?.content || '';
  return [
    buildBaseContext(session),
    '',
    '---',
    '# MASTER KARAR',
    master.slice(0, 12000),
    '',
    '---',
    '# GÖREV — EVRİM ÖZETİ VE İNSAN KARARI KAPILARINI ÇIKAR',
    'SADECE geçerli bir JSON nesnesi döndür (başka hiçbir metin yazma):',
    '{',
    '  "evolutionHighlights": ["3-4 keskin tek cümlelik evrim özeti"],',
    '  "decisionGates": [',
    '    {',
    '      "id": "gate_1",',
    '      "question": "Stratejik yol ayrımı sorusu",',
    '      "recommendation": "A",',
    '      "options": [',
    '        { "id": "A", "label": "Seçenek A", "tradeoff": "Kısa gerekçe" },',
    '        { "id": "B", "label": "Seçenek B", "tradeoff": "Kısa gerekçe" }',
    '      ]',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

export function getDefaultBlueprintPlan(domain: DomainMode): BlueprintFileSpec[] {
  if (domain === 'problem_solving') {
    return [
      {
        id: 'md_root_cause',
        filename: 'ROOT_CAUSE_ANALYSIS.md',
        title: 'Kök Neden Analizi',
        purpose: 'Problemin gerçek kaynağı, semptom-kök neden ayrımı, kanıtlar ve sistemik darboğazlar.',
        selected: true,
      },
      {
        id: 'md_solution',
        filename: 'SOLUTION_BLUEPRINT.md',
        title: 'Nihai Çözüm Tasarımı',
        purpose: 'Kesinleşmiş en iyi çözüm yöntemi, çalışma mekanizması, alternatif kıyaslaması.',
        selected: true,
      },
      {
        id: 'md_action',
        filename: 'ACTION_PLAYBOOK.md',
        title: 'Uygulama ve Aksiyon Planı',
        purpose: 'Adım adım uygulama planı, öncelik sırası, doğrulama metrikleri ve başarı kriterleri.',
        selected: true,
      },
      {
        id: 'md_risks',
        filename: 'RISKS_AND_MITIGATION.md',
        title: 'Risk ve Tedbir Matrisi',
        purpose: 'İkinci dereceden yan etkiler, olası engeller, geri dönüş (rollback) planları.',
        selected: true,
      },
      {
        id: 'md_agent_brief',
        filename: 'AI_EXECUTION_BRIEF.md',
        title: 'AI Ajan Uygulama Talimatı',
        purpose: 'Çözümü doğrudan AI ajanlarına uygulatmak için hazır bağlam, kurallar ve kısıtlar.',
        selected: false,
      },
    ];
  }

  if (domain === 'strategy_general') {
    return [
      {
        id: 'md_strategy',
        filename: 'STRATEGY_MASTER.md',
        title: 'Master Strateji Dokümanı',
        purpose: 'Nihai fikir/strateji özeti, konumlandırma, değer önerisi ve rekabet farkı.',
        selected: true,
      },
      {
        id: 'md_decisions',
        filename: 'DECISIONS_AND_TRADEOFFS.md',
        title: 'Kararlar ve Alternatif Analizi',
        purpose: 'Seçilen yolun gerekçesi, elenen seçenekler, fırsat maliyeti ve kritik karar kayıtları.',
        selected: true,
      },
      {
        id: 'md_execution',
        filename: 'EXECUTION_ROADMAP.md',
        title: 'Uygulama Yol Haritası',
        purpose: '30/60/90 günlük fazlar, ilk hafta aksiyonları, kaynak ve KPI hedefleri.',
        selected: true,
      },
      {
        id: 'md_risks',
        filename: 'RISK_REGISTER.md',
        title: 'Risk Kayıt Defteri',
        purpose: 'Kritik varsayımlar, başarısızlık senaryoları, erken uyarı sinyalleri ve önlemler.',
        selected: true,
      },
    ];
  }

  return [
    {
      id: 'md_01_vision',
      filename: '01_PRODUCT_VISION.md',
      title: 'Ürün Vizyonu & Kapsam',
      purpose: 'Kesinleşmiş uygulama tanımı, hedef kullanıcı, temel kullanıcı yolculuğu (User Journey), MVP kapsamı ve kapsam dışı (Non-Goals).',
      selected: true,
    },
    {
      id: 'md_02_ux',
      filename: '02_UX_SCREENS_AND_DESIGN.md',
      title: 'Ekranlar, UX Akışı & Tasarım Dili',
      purpose: 'Her ekranın bileşen listesi, ekranlar arası akış diyagramı (Mermaid), renk/tipografi/tema kuralları ve boş/hata durumları.',
      selected: true,
    },
    {
      id: 'md_03_arch',
      filename: '03_ARCHITECTURE_AND_DATA.md',
      title: 'Teknik Mimari & Veri Şeması',
      purpose: 'Teknoloji yığını, klasör/modül yapısı, veri modeli/şeması, API/veri akışı, güvenlik, gizlilik ve maliyet sınırları.',
      selected: true,
    },
    {
      id: 'md_04_roadmap',
      filename: '04_BUILD_ROADMAP.md',
      title: 'Adım Adım İnşa Planı & Testler',
      purpose: 'Sıralı geliştirme fazları (Adım 1 → Adım N), her adımın somut "Bitti" kriteri, kritik risk tedbirleri ve test kontrol listesi.',
      selected: true,
    },
    {
      id: 'md_05_agents',
      filename: '05_AGENTS_START_HERE.md',
      title: 'AI Kodlama Ajanı Başlangıç Talimatı',
      purpose: 'Antigravity, Claude Code, Cursor veya Codex’in projeyi hatasız inşa etmesi için okuma sırası, değiştirilemez kurallar (Hard Invariants) ve başlangıç direktifi.',
      selected: true,
    },
  ];
}

export function buildIdeaClarifierPrompt(
  idea: string,
  domain: DomainMode,
  language: 'tr' | 'en' = 'tr'
): string {
  const lens = DOMAIN_LENS[domain] || DOMAIN_LENS.app_product;
  const langLine =
    language === 'en'
      ? '3. Write every question and every option in short, jargon-free, crisp ENGLISH (a non-technical user should understand and click within 5 seconds).'
      : '3. Her soru çok kısa, net ve teknik jargonsuz Türkçe olsun (normal bir kullanıcı 5 saniyede anlayıp tıklayabilmeli).';
  return [
    '[SİSTEM KURALI: HİÇBİR araç/tool ÇAĞIRMA. Sadece geçerli tek bir JSON dizisi döndür, başka hiçbir metin ekleme.]',
    '',
    '# GÖREV — HAM FİKRİ KESKİNLEŞTİRMEK İÇİN 3–4 HIZLI SORU ÜRET',
    `Konu Modu: ${lens.label}`,
    `Kullanıcının Ham Fikri:\n"""\n${idea.trim()}\n"""`,
    '',
    'Kurallar:',
    '1. Kullanıcının metninde ZATEN açıkça belirttiği şeyleri tekrar sorma.',
    '2. Fikri gerçekten profesyonel bir uygulama/çözüm haline getirmek için en kritik **3 veya 4 eksik boşluğu** seç (örn: Platform, Hedef Kullanıcı, Tasarım/Deneyim Hissi, Kapsam/Gelir/Bütçe).',
    langLine,
    '4. Her soru için 3 ila 4 kısa seçenek ver.',
    '',
    'SADECE şu formatta JSON dizisi döndür:',
    '[',
    '  {',
    '    "id": "q_1",',
    '    "question": "Uygulama hangi platformda çalışsın?",',
    '    "options": [',
    '      { "id": "A", "label": "Web Uygulaması (Tarayıcı)" },',
    '      { "id": "B", "label": "Mobil Uygulama (iOS / Android)" },',
    '      { "id": "C", "label": "Masaüstü Uygulaması" },',
    '      { "id": "D", "label": "Web + Mobil (PWA)" }',
    '    ]',
    '  }',
    ']',
  ].join('\n');
}

export function buildBlueprintPlannerPrompt(session: DebateSession): string {
  const master = session.synthesis?.content || '';
  return [
    buildBaseContext(session),
    '',
    '---',
    '# KESİNLEŞMİŞ MASTER KARAR',
    master || summarizeRound(session.rounds[session.rounds.length - 1]),
    '',
    '---',
    '# GÖREV — PROJE MD DOSYA PLANINI BELİRLE',
    'Bu kesinleşmiş fikir/proje için kodlama ajanlarının doğrudan okuyup uygulamayı sıfırdan hatasız inşa edebileceği en ideal **5 adet sıralı profesyonel `.md` dosyasını** belirle.',
    'SADECE geçerli bir JSON dizisi döndür (başka açıklama veya markdown bloğu ekleme):',
    '[',
    '  { "filename": "01_DOSYA_ADI.md", "title": "Kısa Türkçe Başlık", "purpose": "Bu dosyanın tam kapsamı (1-2 net cümle)" }',
    ']',
    'Kurallar:',
    '- Dosya adları `01_`, `02_`, `03_`, `04_`, `05_` ön ekiyle, büyük harf ASCII snake_case ve `.md` uzantılı olsun.',
    '- Uygulama/ürün projelerinde mutlaka bir UX/Ekran Tasarım dosyası (`02_UX_SCREENS_AND_DESIGN.md`) ve son dosya olarak kodlama ajanı başlangıç dosyası (`05_AGENTS_START_HERE.md`) bulunsun.',
  ].join('\n');
}

function buildLockedDecisionsBlock(session: DebateSession): string {
  const gates = session.synthesis?.decisionGates;
  if (!gates || gates.length === 0) return '';

  const locked = gates.filter((g) => g.selectedOptionId || g.customNote?.trim());
  if (locked.length === 0) return '';

  const lines = [
    '## KESİN KULLANICI KARARLARI (DEĞİŞTİRİLEMEZ KİLİT — TBD BIRAKMA!)',
  ];
  for (const g of locked) {
    const opt = g.options.find((o) => o.id === g.selectedOptionId);
    const choiceText = opt
      ? `[${opt.id}] ${opt.label} (${opt.tradeoff})`
      : 'Özel karar';
    const extra = g.customNote?.trim() ? ` · Ek Not: ${g.customNote.trim()}` : '';
    lines.push(`- **${g.question}** → **${choiceText}**${extra}`);
  }
  return lines.join('\n');
}

export function buildBlueprintFilePrompt(
  session: DebateSession,
  target: BlueprintFileSpec,
  allSelected: BlueprintFileSpec[],
  depth: BlueprintDepth = 'concise',
  revision?: { note?: string; previousContent?: string }
): string {
  const master = session.synthesis?.content?.trim();
  const latestRound = session.rounds[session.rounds.length - 1];
  const sourceOfTruth = master
    ? `# MASTER KARAR (TEK DOĞRU KAYNAK)\n${master}`
    : `# SON TARTIŞMA TURU\n${latestRound ? summarizeRound(latestRound) : session.idea}`;

  const lockedDecisions = buildLockedDecisionsBlock(session);

  const siblingsList = allSelected
    .map(
      (f) =>
        `- \`${f.filename}\` (${f.title}): ${f.purpose}${f.id === target.id ? '  <-- SADECE BU DOSYAYI YAZ' : ''}`
    )
    .join('\n');

  const depthRules: Record<BlueprintDepth, string> = {
    concise:
      'UZUNLUK & HIZ KURALI (HIZLI & KESKİN): Toplam **700–1.100 kelime (~5–8 KB)** aralığında kal! Ultra yoğun, cerrahi netlikte, sıfır tekrar ve sıfır dolgu metni olsun. Kodlama ajanları için en ideal yoğunlukta tablolar, veri şemaları ve kesin kurallar ver.',
    standard:
      'UZUNLUK KURALI (STANDART): Toplam **1.300–2.000 kelime (~10–15 KB)** aralığında dengeli, somut ve eksiksiz bir mühendislik dokümanı yaz.',
    deep:
      'UZUNLUK KURALI (KAPSAMLI): Tam detaylı kurumsal dokümantasyon yaz (uç durumlar, tam şemalar ve kapsamlı spesifikasyonlar).',
  };

  const upperName = target.filename.toUpperCase();
  const diagramHint = /UX|DESIGN|SCREEN/.test(upperName)
    ? '7. GÖRSEL AKIŞ KURALI: Ekranlar arası geçişi gösteren geçerli, sade ve okunaklı 1 adet ```mermaid (`flowchart LR`) diyagramı ekle (etiketlerde özel karakter varsa çift tırnak içine al).'
    : /ARCH|DATA|SCHEMA/.test(upperName)
      ? '7. MİMARİ DİYAGRAM KURALI: Sistem veri akışını veya veri modelini gösteren geçerli, sade 1 adet ```mermaid (`flowchart TD` veya `erDiagram`) diyagramı ekle (etiketlerde özel karakter varsa çift tırnak içine al).'
      : '';

  const revisionBlock = revision?.note?.trim()
    ? [
        '',
        '---',
        '## KULLANICI REVİZYON TALİMATI (ZORUNLU ÖNCELİK)',
        `Kullanıcı bu dosya için şu özel değişikliği istedi:\n> ${revision.note.trim()}`,
        revision.previousContent?.trim()
          ? `\nMevcut dosya içeriği (değiştirilmesi istenmeyen doğru kısımları koru, istenen değişikliği cerrahi olarak uygula):\n${revision.previousContent.slice(0, 14_000)}`
          : '',
      ].join('\n')
    : '';

  return [
    buildBaseContext(session),
    '',
    ...(lockedDecisions ? [lockedDecisions, ''] : []),
    '---',
    sourceOfTruth,
    '',
    '---',
    '# PROJE MD PAKETİ HARİTASI (TUTARLILIK İÇİN)',
    siblingsList,
    revisionBlock,
    '',
    '---',
    `# GÖREV — \`${target.filename}\` DOSYASINI ÜRET`,
    `**Başlık:** ${target.title}`,
    `**Dosyanın Amacı:** ${target.purpose}`,
    '',
    'Kurallar:',
    '1. DİSKE DOSYA YAZMA ve HİÇBİR ARAÇ/TOOL ÇAĞIRMA! İçeriği doğrudan bu yanıt metni olarak `# ...` başlığıyla yaz (başta/sonda sohbet cümlesi ekleme).',
    '2. Master Karar ve KESİN KULLANICI KARARLARI zaten kilitlidir; alternatifleri yeniden tartışma veya "TBD / karar verilecek" bırakma.',
    `3. ${depthRules[depth]}`,
    '4. Paketteki diğer `.md` dosyalarının konusuna taşma; yalnızca kendi dosyanın sorumluluğunu %100 tutarlı şekilde yaz.',
    '5. Soyut açıklamalar yerine somut kurallar, net mimari/şema, kısa tablolar ve uygulanabilir maddeler kullan.',
    session.language === 'en'
      ? '6. Language: Crisp, professional English throughout.'
      : '6. Dil: Profesyonel Türkçe (teknik terimler ve kod/dosya adları standart İngilizce).',
    ...(diagramHint ? [diagramHint] : []),
  ].join('\n');
}

export function buildBlueprintAuditPrompt(session: DebateSession): string {
  const locked = buildLockedDecisionsBlock(session);
  const master = session.synthesis?.content?.slice(0, 6000) || '';
  const filesBlock = (session.blueprint?.files || [])
    .filter((f) => f.status === 'done' && f.content.trim())
    .map((f) => {
      const slice =
        f.content.length > 5500
          ? f.content.slice(0, 5500) + '\n...[kısaltıldı]'
          : f.content;
      return `## DOSYA: ${f.filename}\n${slice}`;
    })
    .join('\n\n====================================\n\n');

  return [
    `[SİSTEM KURALI: HİÇBİR araç/tool ÇAĞIRMA. Sadece geçerli tek bir JSON nesnesi döndür.]`,
    '',
    '# GÖREV — ÇAPRAZ-DOSYA MD TUTARLILIK VE KALİTE DENETİMİ (QA)',
    'Aşağıdaki Master Karar, Kilitli Kullanıcı Kararları ve üretilmiş `.md` dosyalarını çapraz denetle:',
    '- Dosyalar arasında çelişen teknoloji/mimari/kapsam kararları var mı?',
    '- Master Karar veya kilitli kullanıcı kararlarıyla ters düşen ya da hâlâ "TBD" bırakılmış bir nokta var mı?',
    '- Bir AI kodlama ajanının kafasını karıştıracak kritik bir eksik var mı?',
    '',
    ...(locked ? [locked, ''] : []),
    '## MASTER KARAR ÖZETİ',
    master,
    '',
    '---',
    '# ÜRETİLEN MD DOSYALARI',
    filesBlock,
    '',
    '---',
    'SADECE şu formatta geçerli tek bir JSON nesnesi döndür (başka metin yok):',
    '{',
    '  "score": 92,',
    '  "summary": "2 cümlelik genel kalite ve tutarlılık değerlendirmesi",',
    '  "issues": [',
    '    {',
    '      "id": "iss_1",',
    '      "severity": "high",',
    '      "file": "DOSYA_ADI.md",',
    '      "conflictWith": "DIGER_DOSYA.md",',
    '      "description": "Çelişki veya eksikliğin net açıklaması",',
    '      "fixInstruction": "Bu dosyada tam olarak neyin nasıl düzeltileceğine dair net talimat"',
    '    }',
    '  ]',
    '}',
    '*(Not: En fazla 6 gerçek ve somut sorun listele; sorun yoksa `issues: []` ve yüksek skor ver.)*',
  ].join('\n');
}

export function buildBlueprintFixPrompt(
  session: DebateSession,
  file: GeneratedMdFile,
  issues: BlueprintAuditIssue[]
): string {
  const locked = buildLockedDecisionsBlock(session);
  const issueLines = issues
    .map(
      (i, idx) =>
        `${idx + 1}. [${i.severity.toUpperCase()}] ${i.description}\n   → Düzeltme Talimatı: ${i.fixInstruction}`
    )
    .join('\n');

  return [
    '[SİSTEM KURALI: DİSKE DOSYA YAZMA ve HİÇBİR ARAÇ/TOOL ÇAĞIRMA! Yalnızca düzeltilmiş tam Markdown içeriğini doğrudan `# ...` başlığıyla yaz.]',
    '',
    `# GÖREV — \`${file.filename}\` DOSYASINDAKİ QA SORUNLARINI CERRAHİ DÜZELT`,
    ...(locked ? ['', locked] : []),
    '',
    '## DÜZELTİLECEK SORUNLAR',
    issueLines,
    '',
    '## MEVCUT DOSYA İÇERİĞİ',
    file.content,
    '',
    '---',
    'Kurallar: Dosyanın mevcut güçlü yapısını ve yoğunluğunu koru; yalnızca yukarıdaki sorunları kesin ve tutarlı şekilde giderip dosyanın güncel tam hâlini saf Markdown olarak döndür.',
  ].join('\n');
}
