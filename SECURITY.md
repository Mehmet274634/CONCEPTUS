# Security Policy — CONCEPTUS

CONCEPTUS is engineered with a **local-first, zero-telemetry, defense-in-depth** security model so your raw startup ideas, source code, and AI subscriptions never leave your machine to third-party intermediaries.

## Security Architecture

1. **Strict Localhost Isolation (`127.0.0.1`):**
   - The embedded Express server binds exclusively to `127.0.0.1` (never `0.0.0.0`), making it unreachable from external network interfaces.
   - Cross-origin API requests (`Origin` header outside `localhost` / `127.0.0.1`) are rejected immediately with `403 Forbidden` (CSRF & DNS-rebinding defense).
2. **Hardened HTTP Headers:**
   - Every response includes `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`.
3. **Electron Desktop Sandbox:**
   - Renderer runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`.
   - Only 2 tightly scoped IPC channels are exposed via `contextBridge`: `conceptus:pick-folder` (OS directory chooser) and `conceptus:open-folder` (strictly validates `fs.statSync(path).isDirectory()` before calling `shell.openPath`, preventing arbitrary file execution).
   - External URLs are blocked from navigating inside the app frame and open strictly in the user's system browser.
4. **Read-Only, Secret-Filtered Repo Scanner (`server/repoContext.ts`):**
   - Strictly excludes `.env*`, `*.pem`, `*.key`, `id_rsa*`, `*secret*`, `*credential*`, `node_modules/`, `.git/`, and binary files before building any prompt context. Verified by automated Vitest security tests (`tests/repoContext.test.ts`).
5. **Zero Extra API Keys / Zero Cloud Sync:**
   - CONCEPTUS executes only the official AI CLIs already installed and signed in on your machine (`agy`, `claude`, `codex`, `gemini`) with read-only / no-tool flags.
   - All sessions (`%APPDATA%\CONCEPTUS\data` on Windows) remain strictly on your local disk.

## Reporting a Vulnerability

If you discover a security issue, please report it privately via GitHub Security Advisories (**Security → Report a vulnerability**) rather than opening a public issue. Please include reproduction steps and affected version. We aim to acknowledge reports within 48 hours.
