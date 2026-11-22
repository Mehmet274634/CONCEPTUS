# CONCEPTUS

**Turn a 2-sentence raw app idea into a battle-tested, agent-ready `.md` blueprint pack — powered 100% by your own local AI CLI subscriptions (zero extra API fees).**

> **Türkçe Özet:** CONCEPTUS; ham bir uygulama fikrini bilgisayarında zaten kurulu olan yapay zekâ CLI araçlarıyla (**Antigravity**, **Claude Code**, **Codex**, **Gemini**) kör analiz → çapraz tartışma → İnsan Kararı Kilidi → paralel 5'li uygulama `.md` paketi süzgecinden geçiren, **%100 yerel ve ek API ücretsiz** fikir evrim & proje mimarisi stüdyosudur.

---

## Why CONCEPTUS?

Most people jump straight into an AI coding tool with a vague 2-line prompt — and get fragile, half-baked apps full of guesswork.

**CONCEPTUS** puts multiple AI brains at the same table **before** a single line of code is written:

1. **Smart Idea Clarifier (`Fikri Netleştir`) + Design & Platform Guardrails** — Sharpens raw thoughts in 3–4 clickable questions and locks target platform, budget, and visual design language.
2. **Blind Round 1 → Anonymous Cross-Debate Round 2** — Agents analyze independently first (preventing groupthink), then critique each other anonymously (`Ajan A`, `Ajan B`, `Ajan C`).
3. **Master Decision + Evolution Summary + Human Decision Gates** — Extracts what the debate improved and locks final trade-offs with 1-click user choices before generating specs.
4. **5-File App-Build `.md` Standard (Single-Wave Parallel, ~55s):**
   - `01_PRODUCT_VISION.md` — Problem, core user loop, MVP boundaries & non-goals
   - `02_UX_SCREENS_AND_DESIGN.md` — Screens, live Mermaid UX flow, locked design tokens, empty/error states
   - `03_ARCHITECTURE_AND_DATA.md` — Stack, folder layout, data schema, Mermaid architecture diagram, security & cost limits
   - `04_BUILD_ROADMAP.md` — Step-by-step build phases (`Step 1 → N`), "Done" criteria & tests
   - `05_AGENTS_START_HERE.md` — Reading order, Hard Invariants & copy-paste starter prompt + auto-generated `AGENTS.md` bridge
5. **Cross-Agent QA Consistency Audit + 1-Click Surgical Fix** — A separate model audits all `.md` files for contradictions and patches only broken sections.
6. **Quality-Protected Quota Circuit Breaker (`Kalite / Özel / Sor`)** — Tracks quota pools independently (`antigravity:claude`, `antigravity:gemini`, `codex:all`, `claude:all`), never silently downgrades flagship work to weak models, and lets you choose your exact backup agent.

---

## Quick Start

### Option 1 — Native Desktop App (Recommended · No Node.js Required)
Download and run the Windows installer from the **[Official Website (Vercel)](https://conceptus-ivory.vercel.app/download)** or **[GitHub Releases](https://github.com/Mehmet274634/CONCEPTUS/releases/latest)**:
- **[CONCEPTUS-Setup-4.2.0.exe](https://github.com/Mehmet274634/CONCEPTUS/releases/latest/download/CONCEPTUS-Setup-4.2.0.exe)** — Full Windows 10/11 installer (Desktop & Start Menu shortcuts, frameless dark window, zero terminal)
- **[CONCEPTUS-4.2.0-Portable.exe](https://github.com/Mehmet274634/CONCEPTUS/releases/latest/download/CONCEPTUS-4.2.0-Portable.exe)** — Standalone portable `.exe` (zero install)
- **[SHA256SUMS.txt](https://github.com/Mehmet274634/CONCEPTUS/releases/latest/download/SHA256SUMS.txt)** — Integrity verification checksums

Build the desktop installers from source:
```bash
npm install
npm run desktop:build   # Outputs release/CONCEPTUS-Setup-4.2.0.exe & Portable.exe
```

### Option 2 — CLI / Local Browser Mode (Developers)
- **Node.js 20+**
- At least **1 installed AI CLI** signed in with your existing subscription:
  - [Antigravity CLI (`agy`)](https://antigravity.google)
  - [Claude Code (`claude`)](https://docs.anthropic.com/en/docs/claude-code)
  - [OpenAI Codex CLI (`codex`)](https://github.com/openai/codex)
  - [Gemini CLI (`gemini`)](https://github.com/google-gemini/gemini-cli)

```bash
npm install
npm run build
npm run cli
```
CONCEPTUS opens at **`http://127.0.0.1:3847`**.

### CLI Options
```bash
node bin/conceptus.mjs --port 3847          # Custom localhost port
node bin/conceptus.mjs --no-open            # Start server without opening browser
```

---

## Development & Verification

```bash
npm run dev        # Concurrent Express API (3847) + Vite HMR (5173)
npm run typecheck  # Strict TypeScript check (tsc --noEmit)
npm test           # Vitest automated unit & security test suite
npm run check      # Full verification pipeline (typecheck + test + production build)
```

---

## Local-First Security & Privacy

- **100% Localhost Bound:** Express listens strictly on `127.0.0.1`, with CORS & `Origin` protection blocking cross-site browser API calls (`403`).
- **Zero Cloud Sync / Zero Telemetry:** Sessions (`data/sessions/*.json`), quota policies, and exported blueprints stay exclusively on your machine.
- **Read-Only Secret-Filtered Repo Scanner:** When attaching a local project folder, `.env*`, private keys, credentials, `node_modules`, and `.git` are strictly excluded from ever reaching any model prompt.

---

## Architecture Docs

Full living documentation lives in [`docs/`](./docs):
- [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md)
- [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/DEBATE_AND_MD_PROTOCOL.md`](./docs/DEBATE_AND_MD_PROTOCOL.md)
- [`docs/ROADMAP.md`](./docs/ROADMAP.md)

## License

MIT © 2026 CONCEPTUS Contributors
