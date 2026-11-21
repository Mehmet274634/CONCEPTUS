# CONCEPTUS — Tasarım Sistemi ve Görsel Kurallar (v4.0 Kilidi)

## 1. Tasarım Kimliği
**Montserrat + Apple Yeni Nesil Dark Liquid Glass + Minimalist 3 Bölgeli Stüdyo**  
İlham: `baglam-five.vercel.app` karanlık minimalist kontrastı + Apple buzlu cam katmanları + sakin, kalabalıktan uzak 3 bölgeli yerleşim.

## 2. Sabit Tipografi Kuralları
- **UI & Başlıklar:** `Montserrat` (`400`, `500`, `600`, `700`) — Başlıklarda `-0.03em` harf aralığı, iki tonlu vurgu (`#f7f8f8` ana + `#7d828b` ikincil).
- **Teknik / Kod / Dosya / Model ID:** `JetBrains Mono` (`400`, `500`).

## 3. Sabit Renk & Cam Tokenları
- **Tuval (`--canvas`):** `#060709` + çok hafif çift-yönlü atmosferik ışık (`#7c74ff` %10, `#3fd0c9` %7).
- **Yüzeyler:**
  - `.glass-panel`: `blur(26px) saturate(165%)`, `1px solid rgba(255,255,255,0.09)`, üst `inset 0 1px 0 rgba(255,255,255,0.09)` ışık kenarı.
  - `.glass-card`: `blur(20px)`, `rounded-2xl`, ince hover kenar parlaması.
  - `.glass-pill`: `rounded-full`, saydam buzlu aksiyon hapı.
- **Vurgu Hiyerarşisi:**
  - Ana CTA: Saf beyaz pill (`#f7f8f8` / `#060709` metin) — ekranda tek baskın odak.
  - İkincil vurgu: `#7c74ff` (evrim/tartışma) · `#3fd0c9` (hazır/proje bağlamı) · `#4cc58a` (başarı/kilitli).

## 4. Sabit 3 Bölgeli Yerleşim
1. **Sol Sütun (`LeftRail`, 244px, kapatılabilir):** Marka, `+ Yeni Oturum`, arama, geçmiş oturumlar (göreceli zaman etiketi + Master/MD durumu).
2. **Orta Yuvarlatılmış Cam Tuval (`rounded-2xl`):** Üstte ince breadcrumb + 3 aşama hapı (`1. Fikir & Tartışma` · `2. Master Karar` · `3. MD Paketi`) + sağda `[Sade | Pro]` anahtarı.
3. **Sağ Üst Yüzen Cam Kutu (`RightToolsBox`, 244px, kapatılabilir):** Bağlı yerel CLI araçları, model sayıları, yenileme ve canlı Aktif Ajan / MD Dosyası sayaçları.

## 5. UX Kuralları (Değiştirilemez)
- **Karar Önceliği:** Master Karar ekranında `Evrim Özeti` ve tıklanabilir `İnsan Kararı Kilidi` her zaman uzun rapor metninin **üstünde** gösterilir.
- **Sıfır Boş Ekran Korkusu:** Fikir alanı boşken 3 tek-tık örnek fikir çipi görünür; yazmaya başlayınca kaybolur.
- **60fps Canlı Akış:** SSE akışları `65ms` toplu işleme + `React.memo` ile takılmadan akar.
