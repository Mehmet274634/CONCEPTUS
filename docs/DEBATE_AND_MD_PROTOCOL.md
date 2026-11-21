# CONCEPTUS — Tartışma, Rol Sistemi ve MD Üretim Protokolü (v3.0)

## 1. Profesyonel Rol Sistemi
Her ajan koltuğu üç moddan birinde çalışabilir:
- **`Genel (Çok Yönlü Uzman)`:** Özel bir önyargı olmadan fikri bütüncül değerlendirir.
- **6 Hazır Kıdemli Rol:** `Baş Sistem Mimarı`, `Ürün & UX Direktörü`, `Risk & Güvenlik Denetçisi`, `İş & Büyüme Stratejisti`, `Pragmatik MVP Lideri`, `Kök Neden & Problem Çözücü`.
- **Özel Rol (`custom`):** Kullanıcının kendi belirlediği rol başlığı ve yönergesi doğrudan sistem talimatına işlenir.

## 2. Evrim Akışı (Adım Adım veya Tek Tıkla `Oto-Pilot`)
1. **Tur 0 — Bağlam & Repo Snapshot:** İsteğe bağlı yerel proje klasörü `.gitignore` ve `.env`/secret filtreli salt-okunur özetle tüm ajanlara eşit dağıtılır.
2. **Tur 1 — Kör Bağımsız Fikirler:** Paralel, birbirini görmeden. Geliştirilmiş Fikir, En Güçlü 3 Artı, En Kritik 3 Eksi/Kör Nokta, Alternatif Yöntem, X/10 Skor.
3. **Tur 2+ — Anonim Çapraz Tartışma (`Ajan A/B/C`):** Diğerlerinden alınacak parçalar, çürütülen varsayımlar, *fikrini değiştirdiği noktalar* ve Evrimleşmiş Çözüm.
4. **Master Karar + Evrim Özeti + İnsan Kararı Kilidi:**
   - Akıllı bağlam budama (son tur tam, önceki turlar özet) ile hızlı Master Karar.
   - Üstte **"Evrim Özeti (Ne Değişti?)"** şeridi.
   - Altta **İnsan Kararı Kilidi (`Decision Gates`)**: Kullanıcının tıklayarak kilitlediği stratejik tercihler sonraki aşamadaki tüm `.md` dosyalarına kesin kural olarak enjekte edilir.
5. **Proje MD Paketi Stüdyosu + Çapraz-Ajan QA Denetimi:**
   - Tek dalgada 6 paralel hızlı üretim (`Hızlı & Keskin`: ~5–8 KB/dosya, ~25–45 sn) + isteğe bağlı **Çoklu-Model Uzman Dağıtımı** (`Mimari → Gemini`, `Güvenlik/Spek → Claude`, `Yol Haritası/Brief → Codex`).
   - **QA Tutarlılık Denetimi:** Üretilen tüm `.md` dosyaları başka bir modelle çapraz kontrol edilir (`0–100` skor) ve tespit edilen çelişkiler tek tıkla cerrahi olarak düzeltilir.
   - Çıktılar tek tek `.md`, toplu `.zip` veya doğrudan `exports/<proje>/` klasörüne kaydedilebilir.
