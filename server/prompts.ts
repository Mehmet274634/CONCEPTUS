import type {
  BlueprintAuditIssue,
  BlueprintDepth,
  BlueprintFileSpec,
  ComplexityLevel,
  DebateRound,
  DebateSession,
  DomainMode,
  GeneratedMdFile,
  ProjectContract,
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

function styleInstruction(seat: SeatConfig, lang: 'tr' | 'en' = 'tr', isDelta = false): string {
  const langName = lang === 'en' ? 'English' : 'Türkçe';
  if (seat.economyMode) {
    return `\n**HIZLI & EKONOMİK MOD:** En fazla ${isDelta ? '170–220' : '200–250'} kelime, madde madde, sıfır tekrar, ultra yoğun ${langName} Markdown yaz.`;
  }
  if (isDelta) {
    return `\n**DELTA TARTIŞMA ÜSLUBU (YÜKSEK SİNYAL / DÜŞÜK MALİYET):** En fazla 280–390 kelime ${langName} Markdown yaz. Diğer ajanlarla zaten anlaştığın kısımları ASLA baştan yazma; her kelime doğrudan çatışmaya, itiraza ve mimari yamaya gitsin.`;
  }
  return `\n**ÜSLUP:** Net, keskin, yoğun ${langName} Markdown (360–520 kelime). Boş övgü ve uzun giriş cümleleri yasak; her cümle somut mimari/ürün kararı taşısın.`;
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
    `## ÖNCEKİ TURUN (TUR ${previousRound.roundNumber}) SIKIŞTIRILMIŞ ANONİM İDDİALARI`,
    summarizeRound(previousRound, seat.id, 1950),
    '',
    '---',
    `## GÖREV — TUR ${newRoundNumber}: ÇATIŞMA ODAKLI DELTA TARTIŞMASI (v${newRoundNumber})`,
    getRoleInstruction(seat),
    'KURAL: Diğer ajanlarla zaten anlaştığın noktaları baştan yazıp kota harcama! Yalnızca **gerçek çatışma eksenlerine, riskli varsayımlara ve somut mimari yamalara** odaklan. Tam olarak şu başlıkları kullan:',
    '',
    '### 1. Uzlaşılan Çekirdek Parçalar (Kısa Onay)',
    'Diğer adaylardan (`Ajan A`, `Ajan B`...) mutlaka korunması gereken en değerli 2–3 somut karar (tek satırlık maddeler).',
    '',
    '### 2. Çürütülen Varsayımlar & Somut İtirazlar',
    'Diğer adaylardaki zayıf, pahalı, riskli veya aşırı karmaşık noktalar (aday adı + somut mühendislik/ürün gerekçesiyle).',
    '',
    '### 3. Kendi Görüşümde Güncellediğim Noktalar',
    'Diğer analizleri görünce revize ettiğin kesin kararlar.',
    '',
    `### 4. Net Çatışma Çözüm Yaması (Delta v${newRoundNumber})`,
    'Çatışan noktalar için kazanan mimari/ürün kararı, net v1 kapsam sınırı ve kalan kritik risk.',
    styleInstruction(seat, session.language, true),
  ].join('\n');
}

export function buildRedTeamPrompt(session: DebateSession, seat: SeatConfig): string {
  const targetDoc =
    session.synthesis?.content?.trim() ||
    (session.rounds.length > 0
      ? summarizeRound(session.rounds[session.rounds.length - 1], undefined, 2200)
      : session.idea);

  return [
    buildBaseContext(session),
    '',
    '---',
    '## HEDEF PLAN / FİKİR (SALDIRI YÜZEYİ)',
    targetDoc.slice(0, 8000),
    '',
    '---',
    '## GÖREV — ŞEYTANIN AVUKATI (RED-TEAM STRES TESTİ)',
    'ROLÜN: Acımasız Yatırımcı, Güvenlik Araştırmacısı ve Rakip Ürün Lideri. Nezaket kesinlikle YASAK. Amacın bu fikrin gerçek dünyada **neden batabileceğini veya yarı yolda kırılacağını** kanıtlamak ve her birine cerrahi panzehir üretmek.',
    '',
    'Tam olarak şu başlıkları kullan:',
    '',
    '### 1. En Ölümcül 5 Başarısızlık Senaryosu',
    'Pazar/kullanıcı terk riski, teknik/ölçek darboğazı, gizli maliyet, güvenlik/suistimal açığı ve kapsam şişmesi eksenlerinde 5 acımasız saldırı.',
    '',
    '### 2. Her Saldırı İçin Somut Panzehir (Mimari / Ürün Düzeltmesi)',
    'Yukarıdaki 5 tehdidi koda geçmeden önce sıfırlayacak somut kararlar.',
    '',
    '### 3. Hayatta Kalma Skoru & Tek Kırmızı Çizgi',
    '`X/10` — Bu fikir hayata geçmeden önce değiştirilmesi ZORUNLU tek kritik şey.',
    styleInstruction(seat, session.language, true),
  ].join('\n');
}

export function buildTargetedChallengePrompt(
  session: DebateSession,
  seat: SeatConfig,
  userQuestion: string
): string {
  const latestContext =
    session.synthesis?.content?.trim().slice(0, 5000) ||
    (session.rounds.length > 0
      ? summarizeRound(session.rounds[session.rounds.length - 1], seat.id, 1800)
      : '');

  return [
    buildBaseContext(session),
    '',
    ...(latestContext ? ['---', '## MEVCUT MASA DURUMU', latestContext, ''] : []),
    '---',
    '## KULLANICININ DOĞRUDAN MÜDAHALESİ / SORUSU (ÖNCELİKLİ)',
    `> ${userQuestion.trim()}`,
    '',
    '## GÖREV — CANLI MASA YANITI',
    getRoleInstruction(seat),
    'Kullanıcı tartışma masasına doğrudan söz hakkı aldı. Tüm projeyi baştan özetleme — doğrudan bu soruyu/itirazı kendi uzmanlık açından keskin ve uygulanabilir şekilde yanıtla:',
    '',
    '### 1. Net Cevap & Pozisyonum',
    'Kullanıcının önerisi veya itirazı hakkında net karar (Destekliyorum / Şartlı Destek / Riskli — neden?).',
    '',
    '### 2. Mimariye & Kapsama Somut Etkisi',
    'Bu karar alınırsa projede tam olarak nelerin değişeceği (kazanım vs. bedel).',
    '',
    '### 3. Önerilen Kesin Yama',
    'Master Karar ve MD paketine işlenecek net 2–3 kural.',
    styleInstruction(seat, session.language, true),
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
    '  "readinessScore": {',
    '    "overall": 88,',
    '    "problemClarity": 92,',
    '    "uxValue": 86,',
    '    "technicalSolidity": 90,',
    '    "securityRisk": 84,',
    '    "mvpSharpness": 90',
    '  },',
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

export function getDefaultBlueprintPlan(
  domain: DomainMode,
  complexity?: ComplexityLevel
): BlueprintFileSpec[] {
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

  const baseAppPack: BlueprintFileSpec[] = [
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
      purpose: 'Her ekranın bileşen listesi, ekranlar arası akış diyagramı (Mermaid), renk/tipografi/tema kuralları ve Loading/Empty/Error uç durum matrisi.',
      selected: true,
    },
    {
      id: 'md_03_arch',
      filename: '03_ARCHITECTURE_AND_DATA.md',
      title: 'Teknik Mimari & Veri Şeması',
      purpose: 'Teknoloji yığını, kesin klasör/modül yapısı, kanonik veri şeması, API/veri akışı, güvenlik, hata yönetimi ve maliyet sınırları.',
      selected: true,
    },
    {
      id: 'md_04_roadmap',
      filename: '04_BUILD_ROADMAP.md',
      title: 'Adım Adım İnşa Planı & Doğrulama',
      purpose: 'Sıralı geliştirme fazları (Faz 1 → Faz N), her faz için yürütülebilir derleme/test kabul komutları ve kritik risk tedbirleri.',
      selected: true,
    },
    {
      id: 'md_05_agents',
      filename: '05_AGENTS_START_HERE.md',
      title: 'AI Kodlama Ajanı Başlangıç Talimatı',
      purpose: 'Antigravity, Claude Code, Cursor veya Codex’in projeyi hatasız inşa etmesi için okuma sırası, Hard Invariants ve faz faz kopyalanabilir başlangıç promptları.',
      selected: true,
    },
  ];

  if (complexity === 'XL') {
    baseAppPack.splice(4, 0, {
      id: 'md_06_security_api',
      filename: '04B_API_AND_SECURITY_SPEC.md',
      title: 'API Kontratları & Güvenlik Mimarisi',
      purpose: 'Kurumsal düzey endpoint/auth sözleşmeleri, RBAC yetki matrisi, hız sınırı, veri şifreleme ve tehdit modeli.',
      selected: true,
    });
  }

  return baseAppPack;
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

export function buildProjectContractPrompt(session: DebateSession): string {
  const locked = buildLockedDecisionsBlock(session);
  const master = session.synthesis?.content?.trim();
  const latestRound = session.rounds[session.rounds.length - 1];
  const source = master || (latestRound ? summarizeRound(latestRound, undefined, 2200) : session.idea);

  return [
    '[SİSTEM KURALI: HİÇBİR araç/tool ÇAĞIRMA. Sadece geçerli tek bir JSON nesnesi döndür; başka hiçbir açıklama veya markdown bloğu ekleme.]',
    '',
    '# GÖREV — DALGA 0: KANONİK PROJE SÖZLEŞMESİ (PROJECT_CONTRACT.json)',
    'Üretilecek tüm `.md` dosyalarının %100 aynı teknoloji, rota, varlık, bileşen adı, sabit eşik, faz sırası ve kırmızı çizgileri kullanması için projenin **değiştirilemez teknik anayasasını** çıkar.',
    '',
    ...(locked ? [locked, ''] : []),
    '## KAYNAK MASTER KARAR',
    source.slice(0, 9000),
    '',
    'SADECE şu şemada tek bir geçerli JSON nesnesi döndür:',
    '{',
    '  "projectName": "Kısa proje adı",',
    '  "stack": ["Örn: React 19 + TypeScript + Vite", "SQLite / IndexedDB", "Tailwind CSS"],',
    '  "entities": ["Veri varlığı veya model adı #1 (PascalCase)", "Model #2", "Model #3"],',
    '  "routes": ["/ (Ana Ekran)", "/ekran-2 (Açıklama)", "/ayarlar (Açıklama)"],',
    '  "folderTree": ["src/components/", "src/features/", "src/services/", "src/db/"],',
    '  "sharedComponents": ["Paylaşımlı UI bileşen adı #1 (PascalCase)", "Bileşen #2", "Bileşen #3"],',
    '  "sharedConstants": ["Eşik, format veya maskeleme sabiti #1 (örn: MIN_FREE_STORAGE_MB=200)", "Sabit #2 (örn: PII_TOKENS=[MASKED_TC]/[MASKED_TEL])"],',
    '  "phases": ["Faz 1: Proje İskeleti, Kalite Kapıları ve Temel Kurulum", "Faz 2: Veri Katmanı & Çekirdek Model", "Faz 3: Ana Özellik Dikey Dilimi", "Faz 4: Entegrasyon, Güvenlik ve Doğrulama"],',
    '  "hardInvariants": ["Asla bozulmayacak kural #1", "Kural #2", "Kural #3"],',
    '  "nonGoals": ["v1 kapsamında kesinlikle yapılmayacak #1", "Non-Goal #2"]',
    '}',
  ].join('\n');
}

function buildContractLockBlock(contract?: ProjectContract): string {
  if (!contract) return '';
  return [
    '## KANONİK PROJE SÖZLEŞMESİ (DALGA 0 KİLİDİ — TÜM DOSYALARDA BİREBİR AYNI İSİMLERİ, SABİTLERİ VE FAZ SIRASINI KULLAN!)',
    `- **Proje:** ${contract.projectName}`,
    ...(contract.stack.length ? [`- **Teknoloji Yığını:** ${contract.stack.join(' · ')}`] : []),
    ...(contract.entities.length ? [`- **Kanonik Veri Varlıkları:** ${contract.entities.join(', ')}`] : []),
    ...(contract.routes.length ? [`- **Kanonik Ekran/Rotalar:** ${contract.routes.join(' · ')}`] : []),
    ...(contract.folderTree.length ? [`- **Klasör Ağacı:** ${contract.folderTree.join(', ')}`] : []),
    ...(contract.sharedComponents?.length
      ? [`- **Kanonik UI Bileşen Adları (02 & 03'te BİREBİR kullan):** ${contract.sharedComponents.join(', ')}`]
      : []),
    ...(contract.sharedConstants?.length
      ? [`- **Kanonik Sabitler / Formatlar / Maske Tokenları (01, 02, 03'te BİREBİR kullan):** ${contract.sharedConstants.join(' · ')}`]
      : []),
    ...(contract.phases?.length
      ? [`- **Kanonik İnşa Fazları (04 & 05'te BİREBİR aynı numara ve kapsamla kullan):**\n${contract.phases.map((p) => `  - ${p}`).join('\n')}`]
      : []),
    ...(contract.hardInvariants.length
      ? [`- **Hard Invariants (Kırmızı Çizgiler):**\n${contract.hardInvariants.map((x) => `  - ${x}`).join('\n')}`]
      : []),
    ...(contract.nonGoals.length ? [`- **v1 Kapsam Dışı (Non-Goals):** ${contract.nonGoals.join(' · ')}`] : []),
  ].join('\n');
}

/**
 * Extracts a compact, authoritative Wave 1 digest (real headings, exact 04_BUILD_ROADMAP phases,
 * and real verification commands) so Wave 2 (`05_AGENTS_START_HERE.md`) has ZERO cross-file drift!
 */
export function buildWave1Digest(files: Array<{ filename: string; content: string; status: string }>): string {
  const done = files.filter((f) => f.status === 'done' && f.content.trim().length > 0 && !/AGENTS|START_HERE|BRIEF/i.test(f.filename));
  if (done.length === 0) return '';

  const lines: string[] = [
    '## DALGA 1 GERÇEK ÇIKTI ÖZETİ (05 DOSYASINI BUNLARLA %100 EŞLEŞTİR — FAZ NUMARASINI ASLA DEĞİŞTİRME!)',
  ];

  for (const f of done) {
    const headings = f.content
      .split(/\r?\n/)
      .filter((l) => /^#{2,3}\s+/.test(l))
      .slice(0, 14)
      .map((h) => h.trim());
    lines.push(`### ${f.filename}`);
    if (headings.length) {
      lines.push(headings.join('\n'));
    }

    if (/ROADMAP|ACTION|PLAYBOOK/i.test(f.filename)) {
      const cmdMatches = Array.from(
        new Set(
          (f.content.match(/`(?:npm run [a-zA-Z0-9:_-]+|npx [a-zA-Z0-9:_-]+)`/g) || []).slice(0, 12)
        )
      );
      if (cmdMatches.length) {
        lines.push(`Doğrulama komutları: ${cmdMatches.join(', ')}`);
      }
    }
  }

  return lines.join('\n').slice(0, 3600);
}

export function buildBlueprintFilePrompt(
  session: DebateSession,
  target: BlueprintFileSpec,
  allSelected: BlueprintFileSpec[],
  depth: BlueprintDepth = 'concise',
  revision?: { note?: string; previousContent?: string },
  contract?: ProjectContract,
  wave1Digest?: string
): string {
  const master = session.synthesis?.content?.trim();
  const latestRound = session.rounds[session.rounds.length - 1];
  const sourceOfTruth = master
    ? `# MASTER KARAR (TEK DOĞRU KAYNAK)\n${master}`
    : `# SON TARTIŞMA TURU\n${latestRound ? summarizeRound(latestRound) : session.idea}`;

  const lockedDecisions = buildLockedDecisionsBlock(session);
  const contractBlock = buildContractLockBlock(contract || session.blueprint?.contract);

  const siblingsList = allSelected
    .map(
      (f) =>
        `- \`${f.filename}\` (${f.title}): ${f.purpose}${f.id === target.id ? '  <-- SADECE BU DOSYAYI YAZ' : ''}`
    )
    .join('\n');

  const depthRules: Record<BlueprintDepth, string> = {
    concise:
      'UZUNLUK & YOĞUNLUK KURALI (HIZLI & KESKİN): Toplam **700–1.050 kelime (~6–9 KB)** aralığında kal! Sıfır tekrar, sıfır dolgu metni; kodlama ajanları için maksimum sinyal yoğunluğu.',
    standard:
      'UZUNLUK & YOĞUNLUK KURALI (STANDART): Toplam **1.200–1.750 kelime (~10–14 KB)** aralığında kal! Eksiksiz mühendislik detayları ver ama diğer dosyalardaki listeleri kopyalayıp şişirme.',
    deep:
      'UZUNLUK & YOĞUNLUK KURALI (KAPSAMLI AMA SIKI — DRY): Toplam **1.800–2.600 kelime (~15–22 KB, kesinlikle 28 KB üstüne taşma!)** aralığında kal! Tam şema, uç durum ve spesifikasyon ver ama başka dosyada tanımlı kuralları tekrar tekrar kopyalayarak bağlam penceresini (context window) şişirme.',
  };

  const upperName = target.filename.toUpperCase();
  const roleSpecificRules: string[] = [];
  if (/VISION|PRODUCT|PRD/.test(upperName)) {
    roleSpecificRules.push(
      '7. TEK SAHİPLİK (DRY) KURALI: Problem, personalar, kullanıcı yolculukları, MVP kabul kriterleri ve Non-Goals listesini yaz; SQL şeması, UI token tablosu veya faz faz terminal komutları yazıp diğer dosyalara taşma.'
    );
  } else if (/UX|DESIGN|SCREEN/.test(upperName)) {
    roleSpecificRules.push(
      '7. GÖRSEL AKIŞ KURALI: Ekranlar arası geçişi gösteren geçerli, sade 1 adet ```mermaid (`flowchart LR`) diyagramı ekle (özel karakter içeren etiketleri çift tırnak içine al).',
      '8. UÇ DURUM MATRİSİ (ZORUNLU): Kritik ekranlar için `Loading | Empty | Error & Retry | Validation` durumlarını tek bir net Markdown tablosunda tanımla.',
      '9. BİLEŞEN & SABİT EŞLEME KURALI: Kanonik Proje Sözleşmesindeki `sharedComponents` ve `sharedConstants` adlarını/eşiklerini BİREBİR kullan; farklı bileşen adı veya çelişen MB/format eşiği uydurma.'
    );
  } else if (/ARCH|DATA|SCHEMA/.test(upperName)) {
    roleSpecificRules.push(
      '7. MİMARİ DİYAGRAM KURALI: Sistem veri akışını veya veri modelini gösteren geçerli, sade 1 adet ```mermaid (`flowchart TD` veya `erDiagram`) diyagramı ekle (özel karakter içeren etiketleri çift tırnak içine al).',
      '8. UÇ DURUM & GÜVENLİK KURALI: Çalışır veri şeması (DDL/TypeScript tipleri), hata/retry stratejisi, girdi doğrulama sınırları ve güvenlik tehdit tedbirlerini somut tablo/kurallarla yaz; `sharedComponents` ve `sharedConstants` adlarını sözleşmeyle %100 aynı tut.'
    );
  } else if (/ROADMAP|ACTION|PLAYBOOK/.test(upperName)) {
    roleSpecificRules.push(
      '7. FAZ KİLİDİ & YÜRÜTÜLEBİLİR DOĞRULAMA KAPILARI (ZORUNLU): Kanonik Proje Sözleşmesindeki `phases` listesini BİREBİR aynı numara ve sırayla (`Faz 1`, `Faz 2`, ...) kullan! Her fazın altına kodlama ajanının çalıştırıp doğrulayacağı somut kabul kriterleri ve terminal/test kontrol komutları (`npm run typecheck`, `npm test` vb.) ekle.'
    );
  } else if (/AGENTS|START_HERE|BRIEF/.test(upperName)) {
    roleSpecificRules.push(
      '7. OKUMA SIRASI & FAZ UYUMU (ZORUNLU): Okuma sırası MUTLAKA `0. PROJECT_CONTRACT.json` ile başlasın (`AGENTS.md` ile %100 uyumlu). Dalga 1 özetindeki `04_BUILD_ROADMAP.md` faz numaraları, faz başlıkları ve doğrulama komutlarıyla BİREBİR örtüş — asla farklı faz kapsamı uydurma!',
      '8. DRY & KISA BAŞLATMA PROMPTLARI (ZORUNLU): Hard Invariants listesini belgede YALNIZCA 1 KEZ (Bölüm 3) yaz! En sondaki **Faz 1 Başlangıç Promptu** ve **Faz 2 Devam Promptu** kod bloklarında tüm Hard Invariants listesini tekrar kopyalama; bunun yerine "`PROJECT_CONTRACT.json` ve `05_AGENTS_START_HERE.md §3` kurallarına %100 uy" diyerek her promptu 12–18 satırlık keskin, kopyala-yapıştır hazır talimat olarak yaz (bu dosya toplamda 14 KB\'ı geçmesin!).'
    );
  }

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
    ...(contractBlock ? [contractBlock, ''] : []),
    ...(wave1Digest ? ['', wave1Digest] : []),
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
    '2. Master Karar, Kanonik Proje Sözleşmesi ve KESİN KULLANICI KARARLARI zaten kilitlidir; alternatifleri yeniden tartışma veya "TBD / TODO / karar verilecek" bırakma.',
    `3. ${depthRules[depth]}`,
    '4. Paketteki diğer `.md` dosyalarının konusuna taşma ve aynı listeleri tekrarlayıp bağlamı şişirme; yalnızca kendi dosyanın sorumluluğunu %100 tutarlı şekilde yaz.',
    '5. Soyut açıklamalar yerine somut kurallar, net mimari/şema, kısa tablolar ve uygulanabilir maddeler kullan.',
    session.language === 'en'
      ? '6. Language: Crisp, professional English throughout.'
      : '6. Dil: Profesyonel Türkçe (teknik terimler ve kod/dosya adları standart İngilizce).',
    ...roleSpecificRules,
  ].join('\n');
}

export function buildBlueprintAuditPrompt(session: DebateSession): string {
  const locked = buildLockedDecisionsBlock(session);
  const contractBlock = buildContractLockBlock(session.blueprint?.contract);
  const lintIssues = session.blueprint?.lint?.issues || [];
  const lintBlock = lintIssues.length
    ? [
        '## YEREL 0-TOKEN LINTER BULGULARI (ZATEN TESPİT EDİLDİ — DERİN MİMARİ ÇELİŞKİLERE ODAKLAN)',
        ...lintIssues.map((i) => `- [${i.severity.toUpperCase()}] ${i.file}: ${i.description}`),
      ].join('\n')
    : '';
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
    'Aşağıdaki Master Karar, Kanonik Proje Sözleşmesi, Kilitli Kullanıcı Kararları ve üretilmiş `.md` dosyalarını çapraz denetle:',
    '- Dosyalar arasında çelişen teknoloji/mimari/kapsam/varlık adları var mı?',
    '- Master Karar veya kilitli kullanıcı kararlarıyla ters düşen ya da hâlâ "TBD" bırakılmış bir nokta var mı?',
    '- Bir AI kodlama ajanının kafasını karıştıracak veya kırık kod yazdıracak kritik bir eksik var mı?',
    '',
    ...(locked ? [locked, ''] : []),
    ...(contractBlock ? [contractBlock, ''] : []),
    ...(lintBlock ? [lintBlock, ''] : []),
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
