# CONCEPTUS — Geliştirme Yol Haritası (`v5.3.3`)

## Tamamlanan Kilometre Taşları (`v5.0` → `v5.3.3`)
- [x] **Dalga 0 Kanonik Proje Sözleşmesi (`PROJECT_CONTRACT.json`) + 2 Dalgalı MD Motoru:** Tüm dosyalar tek bir teknoloji yığını, `sharedComponents`, `sharedConstants`, kilitli `phases` ve `Hard Invariants` anayasasına bağlı üretilir (`01..04` paralel → `05_AGENTS_START_HERE.md` Dalga 1 özetiyle %100 eşleşik).
- [x] **Karmaşık Projeler İçin Üretim Kalitesi Derinlik Kapıları:** `01`’de `Given/When/Then` kabul kriterleri, `02`’de Mermaid akış + 5-durumlu uç durum matrisi, `03`’te çalışır TypeScript/SQL veri şeması, `04`’te yürütülebilir doğrulama komutları, `L/XL` sistemlerde otomatik 6. dosya (`04B_API_AND_SECURITY_SPEC.md`) ve 0-token deterministik mühendislik Linter’ı.
- [x] **Hedef Kodlama Aracı Seçici (`Antigravity` · `Claude Code` · `Cursor` · `Codex`):** Yalnızca seçilen kodlama aracına özel prompt söz dizimi ve resmi köprü dosyası (`.agents/rules`, `CLAUDE.md`, `.cursor/rules`, `AGENTS.md`) üretimi.
- [x] **Canlı Ajan & Kota Sağlık Çubuğu (`quotaProbe.ts`):** Gerçek CLI oturum/plan bilgisi, aktif kota kilitleri, tek tık paralel canlı kota yoklaması (`Kotaları Test Et`) ve tek tık `Sağlıklı Ajanlara Geç`.
- [x] **Çizgisel İlerleme Çubuğu + 0-Token Tur Özeti + `00 · Mimari Özet` Panosu:** Faz 1/2/3 sekmeli prompt kopyalama, tek klasör temiz kayıt ve kurulu IDE’lerde (`Antigravity`, `Cursor`, `VS Code`) tek tıkla açma.
- [x] **Mevcut Projeye Özellik Modu (`Existing Codebase Evolution`):** Regresyon-güvenli 3 dosyalık evrim paketi (`01_CHANGE_PROPOSAL.md`, `02_MIGRATION_AND_ARCH_DIFF.md`, `03_AGENTS_EXECUTION_GUIDE.md`).
- [x] **TR / EN Arayüz & Çıktı Dili + Çapraz-Platform GitHub Releases CI (Windows / macOS / Linux) + Sessiz Masaüstü Güncelleyici + Vercel Tanıtım Sitesi.**
- [x] **`v5.3.1` → `v5.3.3` Güvenlik & Dayanıklılık Sertleştirmesi:** Atomik oturum yazımı (`writeFileAtomic`), canlı SSE yeniden bağlanma snapshot’ı, port-kilitli `Origin`/CORS izolasyonu (yabancı localhost portları dahil `403`), fail-closed SHA-256 masaüstü güncelleme doğrulaması, saatlik GitHub API rate-limit’ine takılmayan redirect güncelleyici, en fazla 6 koltuk + 4 eşzamanlılık sınırı, elle yüklemede boyut/gizli dosya/anahtar maskeleme koruması ve şeffaf gizlilik sınırları.

## Sonraki Olası Geliştirmeler (`v5.4+`)
- [ ] **Oturum İçi MD Sürüm Geçmişi & Görsel Diff (Revizyon Karşılaştırma)**
- [ ] **Çoklu Oturum / Proje Şablon Kütüphanesi (SaaS, Mobil PWA, Electron, API Starter)**
- [ ] **Opsiyonel Bulut API Sağlayıcı Adaptörü (BYOK — CLI kurulumu olmadan API anahtarıyla kullanım)**
