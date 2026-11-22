import { describe, expect, it } from 'vitest';
import {
  analyzeIdeaComplexity,
  estimateSessionBudget,
} from '../server/complexity.ts';

describe('CONCEPTUS v5.0 — 0-Token Complexity Classifier & Budget Estimator', () => {
  it('classifies simple single-screen tools as S with production-grade standard depth and detects missing specs', () => {
    const res = analyzeIdeaComplexity({
      idea: 'Basit bir pomodoro zamanlayıcı ve günlük odak not defteri uygulaması.',
      domain: 'app_product',
    });

    expect(res.level).toBe('S');
    expect(res.score).toBeLessThan(32);
    // Brand promise: never downgrade MD quality; Flagship + standard production depth by default
    expect(res.recommendedCaliber).toBe('flagship');
    expect(res.recommendedDepth).toBe('standard');
    expect(res.recommendedFileCount).toBe(5);
    expect(res.missingSpecs && res.missingSpecs.length).toBeGreaterThanOrEqual(2);
    expect(res.labelTr).toContain('S');
    expect(res.labelEn).toContain('S');
  });

  it('classifies multi-feature consumer apps with external integration as M', () => {
    const res = analyzeIdeaComplexity({
      idea: 'Kişisel okuma listesi ve kitap takip uygulaması; Google Calendar entegrasyonu ile günlük okuma hatırlatıcıları gönderiyor.',
      domain: 'app_product',
    });

    expect(res.level).toBe('M');
    expect(res.recommendedCaliber).toBe('hybrid');
    expect(res.recommendedSeatCount).toBe(3);
    expect(res.recommendedDepth).toBe('standard');
    expect(res.signals.length).toBeGreaterThanOrEqual(1);
  });

  it('classifies multi-layered high-stakes platforms as L or XL and escalates to full Flagship caliber', () => {
    const resL = analyzeIdeaComplexity({
      idea: 'Çoklu rol (RBAC), Stripe abonelik ödeme, gerçek zamanlı sohbet ve AI ajan orkestrasyonu olan B2B SaaS platformu.',
      constraints: 'KVKK uyumlu, audit log zorunlu, web ve mobil.',
      domain: 'tech_project',
    });

    expect(['L', 'XL']).toContain(resL.level);
    expect(resL.recommendedCaliber).toBe('flagship');
    expect(resL.recommendedDepth).toBe('deep');
    expect(resL.recommendedSeatCount).toBe(4);
    expect(resL.signals.length).toBeGreaterThanOrEqual(3);

    const resXL = analyzeIdeaComplexity({
      idea: 'Kurumsal enterprise mikroservis mimarisi, Kafka + Redis dağıtık olay akışı, multi-tenant RBAC, fintech ödeme ve KVKK/GDPR denetim katmanı, iOS ve Android + AI RAG pipeline.',
      domain: 'tech_project',
    });

    expect(resXL.level).toBe('XL');
    expect(resXL.recommendedFileCount).toBe(6);
    expect(resXL.recommendedCaliber).toBe('flagship');
  });

  it('computes accurate call counts and Delta/Caliber savings estimates', () => {
    const flagship = estimateSessionBudget({
      seatCount: 4,
      blueprintFileCount: 6,
      caliber: 'flagship',
      includeContractWave: true,
    });
    const economy = estimateSessionBudget({
      seatCount: 2,
      blueprintFileCount: 5,
      caliber: 'economy',
      includeContractWave: true,
    });

    // 4 seats * 2 rounds + 1 judge = 9 debate calls; 1 contract + 6 files = 7 blueprint calls
    expect(flagship.debateCalls).toBe(9);
    expect(flagship.blueprintCalls).toBe(7);
    expect(flagship.totalCalls).toBe(16);

    expect(economy.totalCalls).toBe(11);
    expect(economy.deltaSavingsPct).toBeGreaterThan(flagship.deltaSavingsPct);
    expect(economy.estimatedSecMax).toBeLessThan(flagship.estimatedSecMax);
  });
});
