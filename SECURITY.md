# Security Policy — CONCEPTUS

Sessions are stored on the user's machine. Prompts and attached context are processed by the configured AI providers. In setup, users can preview attached context and restrict a new session to the providers of its enabled seats. That restriction applies to fallback as well.

## Security architecture

- The server listens on IPv4 loopback. API calls validate the Host and browser Origin. Except for health checks, callers must hold a per-process credential. Streams and export links use a separate read credential. Treat launch URLs and export links as private.
- The Electron renderer runs in a sandbox with context isolation and Node integration disabled. Privileged IPC validates the main frame and exact origin. The updater resolves the official repository and release in the main process, checks SHA-256, and requires the same valid Windows publisher certificate as the running binary. Unsigned installations and certificate changes require a manual update.
- Repo scanning excludes common credential filenames and masks recognized secret patterns. Inspect the sharing preview before sending private source material.
- Folder exports publish a fresh snapshot under the chosen directory. Existing files are preserved.

## Reporting a Vulnerability

If you discover a security issue, please report it privately via GitHub Security Advisories (**Security → Report a vulnerability**) rather than opening a public issue. Please include reproduction steps and affected version. We aim to acknowledge reports within 48 hours.
