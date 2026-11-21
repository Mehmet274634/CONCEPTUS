# PRODUCT_SPEC.md — Ürün Spesifikasyonu, Kapsam ve Birim Ekonomi

## 1. Ürün Özeti & Çekirdek Değer Önerisi (SSOT)

Bu ürün; küçük hizmet işletmelerine yönelik bir "yapay zekâ sohbet botu" **değildir**. Berber ve erkek kuaförleri için geliştirilmiş, **WhatsApp İnteraktif Menü/Buton öncelikli**, serbest metin ve sesli notlarda **ince ve zero-retention AI katmanı** kullanan, çakışmaları **deterministik atomik veritabanı kilidiyle** engelleyen ve işletme sahibine **sıfır dashboard** (yalnızca WhatsApp üzerinden yönetim) sunan dikey bir mikro-SaaS'tır.

### 1.1. Hedef Kitle ve Çözülen Problem
* **Hedef Profil:** Tek koltuklu veya usta odaklı çalışan berberler ve erkek kuaförleri.
* **Ana Acı Noktası (Pain Point):** Tıraş esnasında (elde makas/ustura varken) çalan telefonlara ve WhatsApp mesajlarına bakamama; randevu çakışmaları; son dakika gelmeyen (no-show) müşteriler nedeniyle oluşan doğrudan gelir kaybı.
* **Çözüm Formülü:** 
  $$\text{Otomasyon (0 Hata)} + \text{2 Saat Önce Hatırlatma} + \text{Akşam 21:00 Dürüst Özeti} = \text{Ayda 1–2 Kurtarılan Randevuyla Anında Amortisman}$$

---

## 2. Kullanıcı Rolleri & Temas Noktaları

| Rol | Arayüz | Yetki & Sorumluluk Kapsamı |
| :--- | :--- | :--- |
| **Müşteri** | WhatsApp (Kendi Şahsi Hattı) | `#berberali` QR/linkiyle etkileşim başlatır; İnteraktif Liste/Buton veya serbest metin/ses ile randevu talep eder; `[Onayla]` butonuyla rezervasyonu kesinleştirir; randevusunu iptal eder/değiştirir. |
| **İşletme Sahibi** | WhatsApp (Beyaz Listeli Yönetici Hattı) | Sisteme özel bir web/mobil arayüz kullanmaz. Sadece kendi numarasından deterministik metin komutları (`bugün`, `kapat`, `iptal`, `gelmedi`, `menü`) gönderir; 21:00'de tek bir özet mesajı alır ve no-show düzeltmesi yapar. |
| **Platform Yöneticisi** | Geliştirici CLI / Seed Script | D1 veritabanı üzerinde işletme (`tenants`), servis (`services`) ve kanal eşlemelerini (`channel_bindings`) 5 dakikada kurar. |

---

## 3. MVP ve Faz Kapsam Matrisi

```
[Faz Kapsamı Sınırları]
┌─────────────────────────────────┐      ┌─────────────────────────────┐
│ MVP (İlk 2 Hafta - Kesin Dahil) │ ───> │ Faz 2+ (Doğrulama Sonrası)  │
│ • Berber dikeyinde tek koltuk   │      │ • Coexistence / Özel WABA   │
│ • Merkezi WABA + #slug link/QR  │      │ • Çoklu koltuk / personel   │
│ • Buton-öncelikli randevu akışı │      │ • Google Calendar 2-yönlü   │
│ • Katı JSON serbest metin niyet │      │ • Web dashboard & self-pay  │
│ • 15 dk atomik slot kilidi      │      │ • Yeni dikey: Kadın kuaförü │
│ • 2 saat önce hatırlatma (Cron) │      └─────────────────────────────┘
│ • 21:00 Tahmini Ciro özeti      │
│ • ≤60 sn sesli not (Hafta 2)    │      ┌─────────────────────────────┐
└─────────────────────────────────┘      │ ❌ KESİNLİKLE KAPSAM DIŞI    │
                                         │ • Açık uçlu sohbet / chatbot│
                                         │ • Sağlık (Diş vb.) dikey    │
                                         │ • Pazarlama/Broadcast spam  │
                                         │ • Baileys / Gayriresmî API  │
                                         └─────────────────────────────┘
```

### 3.1. MVP Kapsamı (İlk 2 Hafta — Kesin Dahil)

#### Hafta 1 (Çekirdek Motor)
* **Kanal:** Resmî WhatsApp Cloud API (merkezi numara) + işletmeye özel `#slug` QR kod/link yönlendirmesi.
* **Müşteri Akışı:** 
  * Native Liste (`Hizmet Seçimi`) $\rightarrow$ Native Liste (`Gün/Saat Seçimi`) $\rightarrow$ Onay Butonu (`[Onayla] / [Vazgeç]`).
  * Serbest metin mesajlarında hafif LLM ile katı JSON niyet çıkarımı (`intent`, `service_id`, `date`, `time_window`). LLM asla takvim kararı vermez; hesaplanan slot butonla onaylatılır.
* **Deterministik Çakışma Yönetimi:** 15 dakikalık atomik blok kilidi (`PK(tenant_id, staff_id, slot_epoch)`). Çift randevu ve webhook tekrarında (idempotency) %0 hata.
* **İşletme Sahibi Yönetimi:** Beyaz listeli WhatsApp numarasından çalışan 5 temel komut (`bugün`, `kapat [tarih/saat]`, `iptal [id/telefon]`, `gelmedi [isim/saat]`, `menü`).
* **Otomasyon & Bildirimler:**
  * Randevudan 2 saat önce müşteriye onaylı Utility şablonu (`[Geliyorum]` / `[İptal Et]`).
  * Saat 21:00'de işletme sahibine günlük özet: Toplam randevu, bildirilen no-show ve "Tahmini Ciro" tutarı.

#### Hafta 2 (Farklılaşma & Sertleştirme)
* **Sesli Not Ayrıştırıcı (Feature-Flag):** `voice_enabled=true` olan berberler için $\le 60\text{ sn}$ ve $\le 2\text{ MB}$ sesli notları RAM'de STT'ye (Whisper) sokup metne çeviren, diskte ses depolamayan adaptör.
* **KVKK Aydınlatma & Opt-in:** İlk kez yazan müşteriye 1 satırlık aydınlatma ve randevu onayında örtük onay metni.
* **Pilot Kurulum:** CLI seed komutuyla 1–3 gerçek berberin 5 dakikada sisteme tanımlanması ve canlıya alınması.

### 3.2. Faz 2+ Yol Haritası (MVP Sonrası)
1. **Kendi Numarasıyla Kullanım (Coexistence / Özel WABA):** Meta Coexistence API entegrasyonuyla berberin mevcut WhatsApp Business numarasını devralma (teknik çekirdekteki `channel_bindings` soyutlaması sayesinde kod değişmez).
2. **Çoklu Personel/Koltuk Yönetimi:** Şemadaki `staff_id` alanı aktifleştirilerek "Usta / Çırak / Kalfa" bazında ayrıştırma.
3. **Harici Takvim Entegrasyonu:** Google Calendar ve Apple Calendar için tek yönlü/iki yönlü iCal/OAuth senkronizasyonu.
4. **Self-Service Onboarding:** Berberlerin kredi kartıyla üye olup çalışma saatlerini girebileceği hafif bir web ayar sayfası.
5. **Yeni Dikey Adaptasyonları:** Benzer sabit süreli hizmetler (kadın kuaförü, güzellik merkezi, evcil hayvan kuaförü).

### 3.3. Kesinlikle Kapsam Dışı (Yasaklar ve Sınırlar)
* ❌ **Web / Mobil İşletme Dashboard'u:** Berber arayüz öğrenmeyecek; tüm yönetim WhatsApp üzerinden kalacaktır.
* ❌ **Açık Uçlu Sohbet Botu (GenAI Chatbot):** Genel sohbet, felsefi diyalog, halüsinatif fiyat pazarlığı kesinlikle yasaktır. Kapsam dışı her mesaj sahibe yönlendirilir.
* ❌ **Resmî Olmayan WhatsApp Kütüphaneleri:** Baileys, Puppeteer veya `whatsapp-web.js` kullanımı sıfır toleransla yasaktır.
* ❌ **Özel Nitelikli Sağlık Verisi (Diş Kliniği vb.):** Yüksek KVKK cezaları ve medikal onay yükümlülükleri nedeniyle ilk 6 ay sağlık dikeyine girilmez.
* ❌ **Kampanya / Pazarlama (Marketing) Mesajları:** Müşterilere toplu reklam, duyuru veya indirim mesajı atılamaz. Numara kalite puanı (Quality Rating) daima korunacaktır.

---

## 4. Birim Ekonomi & Finansal Model (Unit Economics)

Model; işletme başı çok düşük sabit altyapı maliyeti ve Meta Utility şablon giderlerinin abonelik bedeline yedirilmesi prensibine dayanır.

### 4.1. Fiyatlandırma Paketleri

| Paket Adı | Aylık Ücret | Dahil Olan Şablon Kotası | Sesli Not (STT) | Hedef Berber Profili |
| :--- | :--- | :--- | :--- | :--- |
| **Standart Berber** | **399 TL / ay** | 350 Utility Şablonu (Hatırlatma + Özet) | Aktif ($\le 60\text{ sn}$) | Günde 8–12 randevu alan tek koltuklu berberler |
| **Yoğun Salon** | **599 TL / ay** | 700 Utility Şablonu (Hatırlatma + Özet) | Aktif ($\le 60\text{ sn}$) | Günde 15–25 randevu alan çift koltuklu/yoğun salonlar |
| **Kota Aşımı** | **1,50 TL / şablon** | Paket bittiğinde otomatik durur veya bakiye ile sürdürülür | - | Spam ve beklenmeyen maliyet sıçramalarını önler |

### 4.2. Değişken Birim Maliyet Kalemleri

* **Meta WhatsApp Cloud API (Türkiye):**
  * Kullanıcı Başlatmalı 24 Saatlik Servis Mesajları: **0,00 USD** (Ücretsiz pencere).
  * İşletme Başlatmalı Utility Şablonu (2 Saat Hatırlatma & 21:00 Akşam Özeti): **~0,0114 USD** (~0,40 TL / adet).
* **AI & Dil Modeli (Zero-Retention LLM):**
  * Kullanıcıların ~%25'i serbest metin yazar. 
  * Çağrı başı ~250 token girdi/çıktı (Gemini Flash / GPT-4o-mini tier): **~0,00004 USD** (~0,0014 TL / işlem).
* **STT — Sesli Not (Groq Whisper / OpenAI Whisper API):**
  * Kullanıcıların ~%10'u sesli not atar (ortalama 20 saniye).
  * Dakika başı 0,006 USD $\rightarrow$ 20 saniye: **~0,0020 USD** (~0,07 TL / ses).
* **Cloudflare Workers & D1 (Serverless Altyapı):**
  * İlk 100 işletmeye kadar Workers Free/Standard plan sınırları içindedir. Berber başına aylık sunucu payı: **< 1,00 TL**.

### 4.3. Berber Başına Aylık Maliyet & Brüt Marj Analizi (Standart Paket: 399 TL)

*Varsayım: Ayda 26 iş günü çalışan, günde 12 randevu alan (aylık ~312 randevu) tipik bir berber işletmesi.*

| Gider Kalemi | Aylık Adet / Hacim | Birim Maliyet | Toplam Aylık Maliyet |
| :--- | :--- | :--- | :--- |
| **2 Saat Hatırlatma Şablonu (Meta)** | 312 adet (Utility) | 0,40 TL | 124,80 TL |
| **21:00 Günlük Özet Şablonu (Meta)** | 26 adet (Utility) | 0,40 TL | 10,40 TL |
| **Serbest Metin JSON Niyet Analizi (LLM)** | ~100 çağrı | 0,0015 TL | 0,15 TL |
| **Sesli Not Çözümleme (STT)** | ~40 adet (ort. 20 sn) | 0,07 TL | 2,80 TL |
| **Cloudflare Workers + D1 Taban Payı** | Paylaştırılmış | Sabit | 1,50 TL |
| **TOPLAM DEĞİŞKEN MALİYET (COGS)** | - | - | **139,65 TL** |
| **NET BRÜT KÂR** | - | **399 TL - 139,65 TL** | **259,35 TL (%65 Marj)** |

> [!TIP]
> **Esnaf Gözünden Amortisman (ROI):** 
> Türkiye'de ortalama saç+sakal tıraşı 300–500 TL bandındadır. Sistem, ayda sadece **1 adet gelmeyen (no-show) müşteriyi** 2 saat önceki hatırlatmayla kurtardığında veya boşalan saati başkasına açtığında, esnaf 399 TL'lik aylık abonelik bedelini **tek bir randevuda amorti eder**.

---

## 5. Tüketim Politikası, Kotalar ve Kötüye Kullanım Koruması

Sistemin marjını korumak ve merkezi WABA numarasını Meta spam filtrelerinden korumak için aşağıdaki katı kurallar uygulanır:

1. **Şablon Üst Limiti (Hard Cap):**
   * Standart Paket için aylık **350 Utility şablonu** aşıldığında sistem yeni hatırlatma mesajlarını sessizce askıya alır (`reminder_status='skipped_cap'`); işletme sahibine WhatsApp'tan kota uyarısı ve üst pakete geçiş butonu gönderilir.
2. **Kullanıcı Başına Aktif Randevu Sınırı:**
   * Bir müşteri numarası aynı işletmede aynı anda **en fazla 1 adet aktif/gelecek randevuya** sahip olabilir. Takvimi art niyetle parsellemeye çalışan istekler deterministik olarak reddedilir.
3. **Sesli Not Güvenlik Bariyeri:**
   * Süresi $>60\text{ sn}$ veya boyutu $>2\text{ MB}$ olan ses kayıtları işleme alınmaz. Müşteriye nazik bir red mesajı döner: *"Lütfen randevu talebinizi 1 dakikadan kısa bir ses kaydıyla veya yazarak iletin."*
4. **Mesaj Frekans Sınırı (Rate Limiting):**
   * Aynı numaradan dakikada 5'ten fazla mesaj gelirse oturum 5 dakika boyunca askıya alınır.
5. **İşletme Sahibi Beyaz Listesi (Whitelist):**
   * Yönetici komutları (`bugün`, `kapat`, `iptal`, `gelmedi`) yalnızca `tenants.owner_phone` ile eşleşen numaradan kabul edilir. Müşteri numaralarından gelen sistem komutları müşteri randevu akışına sokulur veya reddedilir.

---

## 6. Kodlama Öncesi Kesinleşen Stratejik Tercihler

Yazılım geliştirme sürecinde tereddüt yaşanmaması için Master Karar doğrultusunda 3 kritik stratejik tercih kilitlenmiştir:

```
[Stratejik Tercihler SSOT]
1. Pilot Numarası     ───> Tek Merkezi WABA + #slug QR/Link (2 Haftada Çıkış)
2. Sesli Not (STT)    ───> Hafta 2'de Feature Flag ile Eklenecek (Çekirdeği Bloklamaz)
3. Fiyatlandırma/Kota ───> 2 Hafta Ücretsiz Pilot ──> 399 TL/Ay (350 Şablon Sınırı)
```

1. **Pilot Numara Mimarisi (Merkezi Hat):**
   * MVP süresince her berber için ayrı Meta Business doğrulamasıyla vakit kaybedilmez. Tek bir merkezi onaylı WABA hattı açılır; dükkanlara özel üretilen `wa.me/905...text=%23berberali` QR kodları ve bağlantıları ile gelen mesajlar `channel_bindings` üzerinden ilgili `tenant_id`'ye yönlendirilir.
2. **Sesli Not Geliştirme Takvimi:**
   * Hafta 1'de tamamen metin ve interaktif buton/liste randevu akışı ayağa kaldırılır. Sesli not (STT) entegrasyonu Hafta 2'de `tenants.voice_enabled` bayrağı ile izole bir modül olarak bağlanır.
3. **Pilot Ticari Modeli:**
   * Anlaşılan ilk 1–3 pilot berbere 14 gün ücretsiz canlı deneme sunulur. 14 günün sonunda sistemin sağladığı kurtarılan randevu metrikleri gösterilerek **399 TL / ay** Standart Pakete geçirilir.

---

## 7. Temel Başarı Metrikleri (KPI'lar)

MVP'nin başarısı ve Faz 2'ye geçiş onayı aşağıdaki ölçülebilir hedeflere bağlıdır:

* **Çakışma Oranı:** $\%0$ (Atomik slot kilidi sayesinde çakışan randevu sayısı tam olarak sıfır olmalıdır).
* **Sürtünmesiz Akış (Completion Rate):** Başlatılan randevu akışlarının $\ge \%80$'inin işletme sahibinin müdahalesine gerek kalmadan `[Onayla]` butonuyla tamamlanması.
* **No-Show Azalması:** 2 saat önceki hatırlatma ile işletmenin iptal/no-show oranında en az $\%40$ düşüş sağlanması.
* **Sahip Zaman Tasarrufu:** İşletme sahibinin randevu yönetimi için telefonda harcadığı günlük sürenin $\%70$ azalması.
* **Meta Şablon Teslim Başarısı:** Hatırlatma ve özet şablonlarının teslim oranının (Delivery Rate) $\ge \%96$ olması.
