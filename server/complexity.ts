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
    labelTr = 'S · Basit & Odaklı';
    labelEn = 'S · Simple & Focused';
    reasonTr =
      'Küçük kapsamlı proje. En iyi (Amiral) ajanlarla mükemmelleştirebilir veya istersen Ekonomik kalibreyle kotanı %65 koruyabilirsin.';
    reasonEn =
      'Focused small scope. Run Flagship agents for maximum polish, or optionally switch to Economy caliber to save ~65% quota.';
    // Uphold "always best by default" promise while making Economy a 1-click option!
    recommendedCaliber = 'flagship';
    recommendedSeatCount = 2;
    recommendedDepth = 'concise';
    recommendedFileCount = 5;
  } else if (score < 58) {
    level = 'M';
    labelTr = 'M · Standart Ürün';
    labelEn = 'M · Standard Product';
    reasonTr =
      'Çok ekranlı ürün/uygulama. Hibrit Amiral akışı (ön hazırlık hızlı, tartışma + çekirdek mimari Amiral) en ideal kalite/maliyet dengesini verir.';
    reasonEn =
      'Multi-screen product. Hybrid Flagship routing (fast prep, flagship debate & core architecture) delivers peak quality-to-cost.';
    recommendedCaliber = 'hybrid';
    recommendedSeatCount = 3;
    recommendedDepth = 'standard';
    recommendedFileCount = 5;
  } else if (score < 80) {
    level = 'L';
    labelTr = 'L · Karmaşık Sistem';
    labelEn = 'L · Complex System';
    reasonTr =
      'Yüksek riskli / çok katmanlı sistem tespit edildi. Tüm tartışma koltukları ve mimari MD dosyaları için Tam Amiral kalibresi önerilir.';
    reasonEn =
      'Multi-layered high-stakes system detected. Full Flagship caliber is recommended across every debate seat and blueprint file.';
    recommendedCaliber = 'flagship';
    recommendedSeatCount = 4;
    recommendedDepth = 'deep';
    recommendedFileCount = 5;
  } else {
    level = 'XL';
    labelTr = 'XL · Kurumsal Mimari';
    labelEn = 'XL · Enterprise Architecture';
    reasonTr =
      'Kurumsal ölçekli çok modüllü sistem. 4+ Amiral ajan, Red-Team güvenlik kontrolü ve 6–7 dosyalık genişletilmiş MD mimarisi önerilir.';
    reasonEn =
      'Enterprise multi-module system. 4+ Flagship specialists, Red-Team risk pass, and an expanded 6–7 file Blueprint pack recommended.';
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
