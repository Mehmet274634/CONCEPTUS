# CONCEPTUS

**Turn a raw app idea — or an existing repository upgrade — into a battle-tested, agent-ready `.md` blueprint pack, powered by your own local AI CLI subscriptions (zero extra CONCEPTUS API fees).**

> **Türkçe Özet:** CONCEPTUS; ham bir uygulama fikrini (veya mevcut projeye eklenecek yeni özelliği) bilgisayarında zaten kurulu olan yapay zekâ CLI araçlarıyla (**Antigravity**, **Claude Code**, **Codex**, **Gemini**) kör analiz → çapraz delta tartışma → İnsan Kararı Kilidi → **Dalga 0 Sözleşmeli (`PROJECT_CONTRACT.json`)** üretim kalitesi `.md` paketi süzgecinden geçiren, **yerel çalışan (CONCEPTUS bulutu/telemetrisi olmayan)** fikir evrim & mimari stüdyosudur.

---

## Why CONCEPTUS?

Most people jump straight into an AI coding tool with a vague 2-line prompt — and get fragile, half-baked code full of guesswork and cross-file drift.

**CONCEPTUS (`v5.3`)** puts multiple AI specialists at the same table **before** a single line of code is written:

1. **Deep Problem Analysis + Missing-Spec Radar (`Hızlı Netleştir`)** — Scans your brief instantaneously (0 tokens) for complexity (`S/M/L/XL`) and missing architectural dimensions (platform, persistence, auth/RBAC, budget, visual language), then asks 3–4 decisive Principal Architect questions.
2. **Target Coding Tool Adaptation (`Antigravity` · `Claude Code` · `Cursor` · `Codex`)** — Pick one or more target tools upfront. Prompts, syntax (`@file` refs for Claude Code/Cursor, sandbox verification gates for Codex, workspace rules for Antigravity), and exported bridge files (`.agents/rules`, `CLAUDE.md`, `.cursor/rules`, `AGENTS.md`) are generated **exclusively** for the tools you chose.
3. **Live Quota & Agent Readiness Bar** — Displays real CLI auth/plan status (`Claude Pro`, `ChatGPT`, `Antigravity`) and active quota cooldowns upfront, with a 1-click **Probe Quotas** ping and 1-click **Switch to Healthy Agents**.
4. **Blind Round 1 → Anonymous Delta Cross-Debate → Master Decision + Human Decision Gates** — Prevents groupthink, summarizes every round in a 0-token verdict strip, and lets you lock strategic forks with 1 click before writing specs.
5. **Wave 0 Contract (`PROJECT_CONTRACT.json`) + 2-Wave Production MD Engine:**
   - **New App (5 MDs, or 6 MDs for `L`/`XL` complex systems):**
     - `01_PRODUCT_VISION.md` — Problem, personas, Given/When/Then acceptance criteria, MVP vs v2 scope & non-goals
     - `02_UX_SCREENS_AND_DESIGN.md` — Screens, Mermaid flow, canonical `sharedComponents`, design tokens & 5-state edge matrix (`Loading | Empty | Error & Retry | Validation | Offline`)
     - `03_ARCHITECTURE_AND_DATA.md` — Stack, folder tree, Mermaid data/system diagram, runnable TypeScript/SQL schema, API/service contracts & canonical `sharedConstants`
     - `04_BUILD_ROADMAP.md` — Locked build phases (`Phase 1 → N`), exact file lists, executable verification commands & definition of done
     - `04B_API_AND_SECURITY_SPEC.md` *(auto-added for `L`/`XL` complex systems)* — Full API/IPC contracts, RBAC matrix, rate limits, concurrency & threat model
     - `05_AGENTS_START_HERE.md` *(Wave 2 — aligned with Wave 1 outputs)* — Tool-tailored read order, single-source Hard Invariants, anti-patterns & copy-paste Phase 1/2 prompts
   - **Existing Repo Feature Mode (3 MDs):** `01_CHANGE_PROPOSAL.md`, `02_MIGRATION_AND_ARCH_DIFF.md`, `03_AGENTS_EXECUTION_GUIDE.md` — regression-safe evolution for live codebases.
6. **`00 · Visual Architectural Overview` + 1-Click IDE Handoff** — View your contract, Mermaid diagrams, 0-token engineering linter score, and Phase 1/2/3 prompt tabs in one screen, save cleanly to a single folder, and launch **Antigravity**, **Cursor**, or **VS Code** directly.

---

## Quick Start

### Option 1 — Native Desktop App (Recommended · No Node.js Required)
Download the latest release from the **[Official Download Page](https://conceptus-ivory.vercel.app/download)** or **[GitHub Releases (Latest)](https://github.com/Mehmet274634/CONCEPTUS/releases/latest)**:
- **Windows Installer (`CONCEPTUS-Setup-5.3.2.exe`)** — Silent in-app updates, frameless dark window, native OS folder picker, zero terminal
- **Windows Portable (`CONCEPTUS-5.3.2-Portable.exe`)** — Standalone `.exe` (zero install)
- **macOS (`.dmg`) & Linux (`.AppImage`)** — Available on every tagged GitHub Release alongside **`SHA256SUMS.txt`**

Build the Windows desktop installer from source:
```bash
npm install
npm run desktop:build   # Outputs release/CONCEPTUS-Setup-<version>.exe & Portable.exe
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
npm test           # Vitest unit, security & HTTP API integration test suite
npm run check      # Full verification pipeline (typecheck + test + production build)
```

---

## Security & Privacy Boundaries (Transparent Scope)

CONCEPTUS is designed as a **local-first desktop & localhost studio**, with clear and honest data boundaries:

- **What stays strictly on your machine:** All session histories (`data/sessions/*.json`, written atomically), exported `.md` packs, cooldown state, and preferences stay exclusively on your local disk. CONCEPTUS operates **no backend cloud database and collects zero telemetry**.
- **What is sent externally:** When you run a debate, clarify an idea, probe quotas, or generate blueprints, your prompt and attached context are passed to the **local AI CLI tools you choose** (`agy`, `claude`, `codex`, `gemini`), which communicate with their respective model providers under your own account and privacy terms.
- **Localhost & Desktop Isolation:** Express binds exclusively to `127.0.0.1` with CORS and `Origin` checks blocking cross-site browser calls (`403`). Electron enables `contextIsolation`, `sandbox`, and `nodeIntegration: false`, and verifies HTTPS host allowlists + `SHA256SUMS.txt` on updates. Local API endpoints are unauthenticated for single-user local usage (trust boundary = local processes on your machine).
- **CLI Read-Only / Sandbox Guardrails:** CLI runs use separate argument arrays (`shell: false`) with provider restrictions (`codex exec -s read-only`, `claude --safe-mode --tools ""`, `agy --disable-slash-commands --sandbox`, `gemini --approval-mode plan`).
- **Best-Effort Secret Filtering (Not a Guarantee):** Both the local repo scanner and manual file uploader enforce file size limits, skip sensitive filenames (`.env*`, `.pem`, `.key`, `id_rsa`, `*secret*`, `*credential*`, `service-account*.json`), and redact common key/token formats (`sk-*`, `AIza*`, `ghp_*`, `github_pat_*`, `AKIA*`, `xox*`, PEM private keys, `Bearer` tokens). Pattern-based filtering is **best-effort** and cannot catch every custom secret format — never paste production credentials directly into prompts.

---

## Architecture Docs

Living architecture documentation lives in [`docs/`](./docs):
- [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md)
- [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/DEBATE_AND_MD_PROTOCOL.md`](./docs/DEBATE_AND_MD_PROTOCOL.md)
- [`docs/ROADMAP.md`](./docs/ROADMAP.md)

## License

MIT
