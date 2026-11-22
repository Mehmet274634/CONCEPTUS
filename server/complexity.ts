import type {
  BlueprintDepth,
  CaliberPreference,
  ComplexityAssessment,
  ComplexityLevel,
  DomainMode,
} from './types.ts';

interface SignalRule {
  id: string;
  labelTr: string;
  labelEn: string;
  weight: number;
  pattern: RegExp;
}

const COMPLEXITY_SIGNALS: SignalRule[] = [
  {
    id: 'payments',
    labelTr: 'Ödeme / Abonelik',
    labelEn: 'Payments / Billing',
    weight: 18,
    pattern: /\b(ödeme|abonelik|fatura|stripe|iyzico|paytr|billing|subscription|checkout|wallet|cüzdan|escrow|pazar\s*yeri|marketplace)\b/i,
  },
  {
    id: 'auth_rbac',
    labelTr: 'Çoklu Rol / Yetki',
    labelEn: 'Multi-Role / RBAC',
    weight: 16,
    pattern: /\b(yetki|rol|admin|tenant|multi-tenant|saas|rbac|oauth|sso|kurumsal|organizasyon|ekip|team|organization|permission)\b/i,
  },
  {
    id: 'realtime',
    labelTr: 'Gerçek Zamanlı / Canlı',
    labelEn: 'Real-Time / Sync',
    weight: 16,
    pattern: /\b(canlı|gerçek\s*zamanlı|websocket|realtime|real-time|sohbet|chat|bildirim|push|senkronizasyon|sync|collaborative|işbirlikli)\b/i,
  },
  {
    id: 'ai_pipeline',
    labelTr: 'AI / Çoklu Ajan Motoru',
    labelEn: 'AI / Multi-Agent Pipeline',
    weight: 15,
    pattern: /\b(yapay\s*zeka|llm|rag|vektör|vector|embedding|ajan|agent|orchestrat|mcp|pipeline|otomasyon|workflow|ocr|sesli|voice)\b/i,
  },
  {
    id: 'security_compliance',
    labelTr: 'Güvenlik & Uyum (KVKK/GDPR)',
    labelEn: 'Security & Compliance',
    weight: 18,
    pattern: /\b(kvkk|gdpr|hipaa|şifreleme|encryption|zero-trust|audit|denetim|sağlık|finans|banka|fintech|medikal|hukuk|compliance)\b/i,
  },
  {
    id: 'multi_platform',
    labelTr: 'Çoklu Platform',
    labelEn: 'Multi-Platform',
    weight: 14,
    pattern: /\b(ios\s*(ve|&|\+|\/)\s*android|web\s*(ve|&|\+|\/)\s*mobil|cross-platform|electron|masaüstü\s*(ve|&|\+)\s*mobil|mobile\s+and\s+web)\b/i,
  },
  {
    id: 'enterprise_scale',
    labelTr: 'Yüksek Ölçek / Mikroservis',
    labelEn: 'High Scale / Microservices',
    weight: 22,
    pattern: /\b(mikroservis|microservice|kubernetes|k8s|kafka|redis|dağıtık|distributed|yüksek\s*trafik|milyon|enterprise|erp|crm|b2b)\b/i,
  },
  {
    id: 'external_integrations',
    labelTr: 'Harici API / Entegrasyon',
    labelEn: 'External API Integrations',
    weight: 12,
    pattern: /\b(whatsapp|telegram|webhook|api\s*entegrasyon|banka\s*api|kargo|e-fatura|google\s*calendar|slack|github\s*api|integration)\b/i,
  },
];

const SIMPLICITY_SIGNALS = /\b(basit|küçük|mini|tek\s*sayfa|landing|hesaplayıcı|calculator|todo|to-do|not\s*defteri|sayaç|timer|pomodoro|script|tek\s*ekran|simple|lightweight|minimal|single-page)\b/i;

interface SpecGapRule {
  label: string;
  presentPattern: RegExp;
}

const CRITICAL_SPEC_GAPS: SpecGapRule[] = [
  {
    label: 'Hedef Platform (Web / Mobil / Masaüstü)',
    presentPattern:
      /\b(web|mobil|mobile|ios|android|pwa|electron|masaüstü|desktop|chrome|eklenti|extension|cli|api|react|next\.?js|flutter|swift|kotlin|tauri)\b/i,
  },
  {
    label: 'Veri Saklama & Senkron (Yerel / Bulut)',
    presentPattern:
      /\b(local-?first|yerel|offline|indexeddb|sqlite|postgres|supabase|firebase|bulut|cloud|veritabanı|database|db|senkron|sync|json|storage|depolama)\b/i,
  },
  {
    label: 'Kullanıcı & Giriş / Yetki Modeli',
    presentPattern:
      /\b(giriş|login|auth|hesap|kayıtsız|tek\s*kullanıcı|kişisel|ekip|team|rol|rbac|admin|tenant|oauth|anonim|multi-?user|single-?user)\b/i,
  },
  {
    label: 'Bütçe / İşletme Maliyeti veya MVP Sınırı',
    presentPattern:
      /\b(0\s*usd|ücretsiz|maliyet|bütçe|mvp|abonelik|gelir|fiyat|saas|ücretli|free|budget|cost|hafta|kapsam)\b/i,
  },
  {
    label: 'Görsel Tasarım Dili / UX Hissi',
    presentPattern:
      /\b(tasarım|tema|dark|light|karanlık|aydınlık|minimal|glass|sade|şık|mobil\s*öncelikli|dashboard|ui|ux|design)\b/i,
  },
];

export function analyzeIdeaComplexity(options: {
  idea: string;
  constraints?: string;
  contextText?: string;
  domain?: DomainMode;
}): ComplexityAssessment {
  const combined = [options.idea || '', options.constraints || '', (options.contextText || '').slice(0, 1500)]
    .join('\n')
    .trim();

  let score = 24;
  const matchedLabels: string[] = [];

  for (const rule of COMPLEXITY_SIGNALS) {
    if (rule.pattern.test(combined)) {
      score += rule.weight;
      matchedLabels.push(rule.labelTr);
    }
  }

  const missingSpecs: string[] = [];
  if (
    combined.length >= 12 &&
    (options.domain === 'app_product' || options.domain === 'tech_project' || !options.domain)
  ) {
    for (const gap of CRITICAL_SPEC_GAPS) {
      if (!gap.presentPattern.test(combined)) {
        missingSpecs.push(gap.label);
      }
    }
  }

  // Idea length & detail density adds modest structural signal
  const wordCount = combined.split(/\s+/).filter(Boolean).length;
  if (wordCount > 120) score += 12;
  else if (wordCount > 55) score += 6;

  if (options.domain === 'tech_project') score += 6;

  // Simplicity cue softens score only if no heavy enterprise/payment/security cues dominate
  if (SIMPLICITY_SIGNALS.test(options.idea || '') && matchedLabels.length <= 1) {
    score -= 16;
  }

  score = Math.max(8, Math.min(100, score));

  let level: ComplexityLevel;
  let labelTr: string;
  let labelEn: string;
  let reasonTr: string;
  let reasonEn: string;
  let recommendedCaliber: CaliberPreference;
  let recommendedSeatCount: number;
  let recommendedDepth: BlueprintDepth;
  let recommendedFileCount: number;

  if (score < 32) {
    level = 'S';
    labelTr = 'S · Odaklı Ürün';
    labelEn = 'S · Focused Product';
    reasonTr =
      'Odaklı kapsamlı proje. Üretim kalitesinde Standart MD paketi ve Amiral ajanlarla tek seferde hatasız inşa önerilir.';
    reasonEn =
      'Focused scope. Standard production-grade MD blueprint with Flagship agents recommended for zero-drift execution.';
    recommendedCaliber = 'flagship';
    recommendedSeatCount = 2;
    recommendedDepth = 'standard';
    recommendedFileCount = 5;
  } else if (score < 58) {
    level = 'M';
    labelTr = 'M · Standart Ürün';
    labelEn = 'M · Standard Product';
    reasonTr =
      'Çok ekranlı ürün/uygulama. Hibrit Amiral akışı ve tam şemalı Standart MD paketi en ideal kalite/hız dengesini verir.';
    reasonEn =
      'Multi-screen product. Hybrid Flagship routing with full-schema Standard MDs delivers peak quality-to-speed.';
    recommendedCaliber = 'hybrid';
    recommendedSeatCount = 3;
    recommendedDepth = 'standard';
    recommendedFileCount = 5;
  } else if (score < 80) {
    level = 'L';
    labelTr = 'L · Karmaşık Sistem';
    labelEn = 'L · Complex System';
    reasonTr =
      'Çok katmanlı karmaşık sistem tespit edildi. Tam Amiral ajanlar ve 6 dosyalık Derin MD paketi (ayrı API & Güvenlik kontratıyla) önerilir.';
    reasonEn =
      'Multi-layered complex system detected. Full Flagship agents and a 6-file Deep MD pack (with dedicated API & Security spec) recommended.';
    recommendedCaliber = 'flagship';
    recommendedSeatCount = 4;
    recommendedDepth = 'deep';
    recommendedFileCount = 6;
  } else {
    level = 'XL';
    labelTr = 'XL · Kurumsal Mimari';
    labelEn = 'XL · Enterprise Architecture';
    reasonTr =
      'Kurumsal ölçekli çok modüllü sistem. 4+ Amiral ajan, Red-Team güvenlik kontrolü ve 6 dosyalık Derin MD mimarisi önerilir.';
    reasonEn =
      'Enterprise multi-module system. 4+ Flagship specialists, Red-Team risk pass, and an expanded 6-file Deep Blueprint pack recommended.';
    recommendedCaliber = 'flagship';
    recommendedSeatCount = 4;
    recommendedDepth = 'deep';
    recommendedFileCount = 6;
  }

  return {
    level,
    score,
    labelTr,
    labelEn,
    reasonTr,
    reasonEn,
    signals: matchedLabels.slice(0, 5),
    missingSpecs: missingSpecs.slice(0, 4),
    recommendedCaliber,
    recommendedSeatCount,
    recommendedDepth,
    recommendedFileCount,
  };
}

export interface SessionBudgetEstimate {
  debateCalls: number;
  blueprintCalls: number;
  totalCalls: number;
  estimatedSecMin: number;
  estimatedSecMax: number;
  deltaSavingsPct: number;
}

export function estimateSessionBudget(options: {
  seatCount: number;
  blueprintFileCount: number;
  caliber: CaliberPreference;
  includeContractWave?: boolean;
}): SessionBudgetEstimate {
  const seats = Math.max(1, Math.min(6, options.seatCount));
  const files = Math.max(1, Math.min(8, options.blueprintFileCount));
  // Round 1 (N) + Delta Round 2 (N) + Master Judge (1)
  const debateCalls = seats * 2 + 1;
  // Wave 0 Contract (1) + Parallel MD files (files)
  const blueprintCalls = (options.includeContractWave !== false ? 1 : 0) + files;
  const totalCalls = debateCalls + blueprintCalls;

  const mult = options.caliber === 'economy' ? 0.55 : options.caliber === 'hybrid' ? 0.8 : 1.15;
  const estimatedSecMin = Math.round((35 + seats * 7 + files * 5) * mult);
  const estimatedSecMax = Math.round((62 + seats * 12 + files * 9) * mult);
  const deltaSavingsPct = options.caliber === 'economy' ? 65 : options.caliber === 'hybrid' ? 52 : 42;

  return {
    debateCalls,
    blueprintCalls,
    totalCalls,
    estimatedSecMin,
    estimatedSecMax,
    deltaSavingsPct,
  };
}
