export const MAX_UPLOAD_FILES = 5;
export const MAX_UPLOAD_FILE_BYTES = 512 * 1024; // 512 KB per file
export const MAX_UPLOAD_CHARS = 20_000;

const BLOCKED_UPLOAD_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /secret/i,
  /credential/i,
  /token\.json$/i,
  /\.keystore$/i,
  /service[-_]?account.*\.json$/i,
];

export function isBlockedUploadFilename(filename: string): boolean {
  const base = filename.split(/[\\/]/).pop() || filename;
  return BLOCKED_UPLOAD_PATTERNS.some((re) => re.test(base));
}

/**
 * Best-effort client-side secret redaction for manually attached files before they enter prompt context.
 * Mirrors server/repoContext.ts patterns.
 */
export function redactUploadedSecrets(text: string): {
  text: string;
  redactedCount: number;
} {
  let redactedCount = 0;
  const replaceCounted = (input: string, re: RegExp, replacement: string): string =>
    input.replace(re, () => {
      redactedCount++;
      return replacement;
    });

  let out = text;
  out = replaceCounted(
    out,
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]'
  );
  out = replaceCounted(
    out,
    /\b(sk-(?:ant-|proj-|live-|test-)?[a-zA-Z0-9_-]{20,})\b/g,
    '[REDACTED_API_KEY]'
  );
  out = replaceCounted(out, /\b(rk_live_[a-zA-Z0-9_-]{16,})\b/g, '[REDACTED_API_KEY]');
  out = replaceCounted(out, /\b(AIza[0-9A-Za-z_-]{30,})\b/g, '[REDACTED_GOOGLE_KEY]');
  out = replaceCounted(
    out,
    /\b((?:ghp|gho|ghu|ghs)_[a-zA-Z0-9]{25,}|github_pat_[a-zA-Z0-9_]{30,})\b/g,
    '[REDACTED_GH_TOKEN]'
  );
  out = replaceCounted(out, /\b(AKIA[0-9A-Z]{16})\b/g, '[REDACTED_AWS_KEY]');
  out = replaceCounted(out, /\b(xox[bpoa]-[a-zA-Z0-9-]{16,})\b/g, '[REDACTED_SLACK_TOKEN]');
  out = replaceCounted(
    out,
    /\b(Bearer\s+[a-zA-Z0-9._-]{24,})\b/gi,
    'Bearer [REDACTED_TOKEN]'
  );
  out = out.replace(
    /(api[_-]?key|secret|password|passwd|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*["'][^"'\r\n]{8,}["']/gi,
    (_m, keyName: string) => {
      redactedCount++;
      return `${keyName}: "[REDACTED]"`;
    }
  );

  return { text: out, redactedCount };
}
