# CONCEPTUS — Teknik Mimari

## 1. Genel Yapı (Tek Repo, Yerel-Öncelikli Masaüstü + CLI)
- **Masaüstü Kabuğu (`electron/`):** Electron (`contextIsolation: true`, `sandbox: true`, tek örnek kilidi, karanlık başlık çubuğu, doğal `dialog.showOpenDialog` klasör seçici & `shell.openPath` ile klasör açma, `esbuild` ile gömülü Express sunucusu — terminal penceresiz & Node.js gerektirmez).
- **Frontend (`src/`):** React 19 + Vite + Tailwind CSS v4 + `lucide-react` + `react-markdown` (`remark-gfm`) + lazy-loaded `mermaid`.
- **Backend (`server/`):** Node.js + Express 5 + SSE + `child_process.spawn` + `jszip` + salt-okunur `repoContext.ts` + merkezi `paths.ts` (`%APPDATA%\CONCEPTUS\data` masaüstünde, `./data` CLI modunda).
- **Kalıcı Yerel Veri (`data/` & `exports/`):**
  - `data/providers-cache.json` — Anında açılış (<5ms) için kurulu CLI ve model listesi önbelleği.
  - `data/quota-cooldowns.json` — Kotası dolan model havuzlarını (örn. `antigravity:claude`, `claude:all`) 30 dk boyunca otomatik devre dışı bırakıp yedek havuza aktaran Circuit Breaker kaydı.
  - `data/fallback-policy.json` — Kullanıcının yedek model kuralı (`quality_auto` eşit kalite koruması / `custom` özel yedek ajan / `ask` manuel onay).
  - `data/sessions/*.json` — Tüm tartışma turları, Master Karar ve üretilen MD paketleri.
  - `exports/<proje-adi>/*.md` — Kullanıcının tek tıkla fiziksel klasöre aktardığı MD paketleri.

## 2. CLI Adaptör Protokolleri (Sıfır API, Tam Abonelik)
Prompt'lar Windows 8191 karakter argüman sınırına takılmamak için daima UTF-8 **`stdin`** üzerinden aktarılır; iptal durumunda Windows süreç ağacı (`taskkill /T /F`) temizlenir.

| Sağlayıcı | Komut & Bayraklar | Akış (Streaming) Protokolü |
| :--- | :--- | :--- |
| **Antigravity CLI** | `agy --input-format stream-json --output-format stream-json --disable-slash-commands [--model M] [--effort E]` | Stdin: `{"event":"user","message":{"content":"..."}}` · Stdout: `step_update.text_delta` & `result.response` |
| **Claude Code** | `claude -p --output-format stream-json --verbose --include-partial-messages --safe-mode --no-session-persistence --tools "" [--model M] [--effort E]` | Stdin: düz UTF-8 · Stdout: `stream_event.content_block_delta` & `result` |
| **Codex CLI** | `codex exec --json --skip-git-repo-check --ephemeral -s read-only [-m M] [-c model_reasoning_effort="E"] -` | Stdin: düz UTF-8 · Stdout: `item.completed` (`agent_message`) & `turn.completed` |
| **Gemini CLI** | `gemini --skip-trust -p "..." -o stream-json --approval-mode plan [-m M]` | Stdin + prompt · Stdout: `message` / `result` |

## 3. Hız, Güvenlik ve Kararlılık Kuralları
1. **Localhost Güvenlik Kilidi:** Sunucu yalnızca `127.0.0.1` üzerinde dinler; CORS ve `Origin` koruması harici sitelerden gelen tüm tarayıcı API çağrılarını (`403`) engeller. `.gitignore` kişisel oturum (`data/`) ve çıktı (`exports/`) klasörlerini korur.
2. **Disk Önbellekli Hızlı Açılış (`2 ms`):** `/api/providers` önce `data/providers-cache.json` okur, arayüz anında açılır; arka planda veya kullanıcı yenileyince tazelenir.
3. **Kota Circuit Breaker & Otomatik Yedek Model (`server/fallback.ts`):** Kota havuzları ayrı takip edilir (`antigravity:claude`, `antigravity:gemini`, `antigravity:oss`, `claude:all`, `codex:all`, `gemini:all`). Bir havuz kota/429/limit hatası verdiğinde 30 dk bekleme listesine alınır ve o görev anında farklı bir sağlıklı havuza (`↻ Yedek`) aktarılır. Eksik kalan MD dosyaları tek tıkla (`POST /api/sessions/:id/blueprint/retry-failed`) yalnızca başarısız dosyalar hedeflenerek tamamlanır.
4. **Seviye-Bazlı Tek Dalga Paralel MD Üretimi:** `Hızlı & Keskin` (~5–8 KB/dosya, ~35–55 sn), `Standart` ve `Kapsamlı` seçimleri hem dosya yoğunluğunu hem atanan uzman model katmanını otomatik günceller; 6'lı tek dalga paralel çalışır.
5. **Modern Doğal İşletim Sistemi Klasör Seçici:** Windows 11 modern Dosya Gezgini (`server/pick-folder.ps1` — COM `IFileOpenDialog` + `FOS_PICKFOLDERS`), macOS (`osascript`) ve Linux (`zenity`) doğal klasör seçimi + salt-okunur secret-filtreli repo taraması (`repoContext.ts`).
6. **Batched SSE Rendering:** Frontend gelen token delta parçalarını `65ms` aralıkla tek state güncellemesinde işler.
