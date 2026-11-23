import { describe, expect, it } from 'vitest';
import {
  buildReleaseFromTag,
  compareSemver,
  extractSha256ForFile,
  isAllowedUpdateHost,
  parseGitHubReleasePayload,
} from '../server/updater.ts';

describe('CONCEPTUS v5.0 — Auto-Updater Engine & Security Guards', () => {
  it('compares semantic versions accurately across tags and multi-digit minors', () => {
    expect(compareSemver('4.2.0', '5.0.0')).toBe(-1);
    expect(compareSemver('5.0.0', 'v5.0.0')).toBe(0);
    expect(compareSemver('5.10.0', '5.2.0')).toBe(1);
    expect(compareSemver('5.0.0', '5.0.1-beta.1')).toBe(-1);
  });

  it('strictly enforces HTTPS and official GitHub release hosts', () => {
    expect(isAllowedUpdateHost('https://github.com/MehmetKoyun0/CONCEPTUS/releases/latest')).toBe(true);
    expect(isAllowedUpdateHost('https://objects.githubusercontent.com/some/file.exe')).toBe(true);
    expect(isAllowedUpdateHost('https://release-assets.githubusercontent.com/a/b.exe')).toBe(true);

    // Reject HTTP, spoofed subdomains, arbitrary domains
    expect(isAllowedUpdateHost('http://github.com/MehmetKoyun0/CONCEPTUS')).toBe(false);
    expect(isAllowedUpdateHost('https://github.com.evil.example/file.exe')).toBe(false);
    expect(isAllowedUpdateHost('https://evil.example/CONCEPTUS-Setup-5.0.0.exe')).toBe(false);
    expect(isAllowedUpdateHost('file:///C:/Windows/calc.exe')).toBe(false);
  });

  it('parses SHA256SUMS.txt in both GNU and filename-first formats', () => {
    const hashA = 'a'.repeat(64);
    const hashB = 'b'.repeat(64);
    const sums = [
      '# CONCEPTUS Checksums',
      `${hashA}  CONCEPTUS-Setup-5.0.0.exe`,
      `${hashB} *CONCEPTUS-5.0.0-Portable.exe`,
    ].join('\n');

    expect(extractSha256ForFile(sums, 'CONCEPTUS-Setup-5.0.0.exe')).toBe(hashA);
    expect(extractSha256ForFile(sums, 'conceptus-5.0.0-portable.exe')).toBe(hashB);
    expect(extractSha256ForFile(sums, 'MISSING.exe')).toBeNull();
  });

  it('extracts cross-platform release assets and detects updates cleanly', () => {
    const payload = {
      tag_name: 'v5.1.0',
      name: 'CONCEPTUS v5.1.0',
      html_url: 'https://github.com/MehmetKoyun0/CONCEPTUS/releases/tag/v5.1.0',
      published_at: '2026-11-25T12:00:00Z',
      body: '## Yenilikler\n- Otomatik güncelleme motoru.',
      assets: [
        {
          name: 'CONCEPTUS-Setup-5.1.0.exe',
          size: 118_000_000,
          browser_download_url:
            'https://github.com/MehmetKoyun0/CONCEPTUS/releases/download/v5.1.0/CONCEPTUS-Setup-5.1.0.exe',
        },
        {
          name: 'CONCEPTUS-5.1.0-Portable.exe',
          size: 108_000_000,
          browser_download_url:
            'https://github.com/MehmetKoyun0/CONCEPTUS/releases/download/v5.1.0/CONCEPTUS-5.1.0-Portable.exe',
        },
        {
          name: 'SHA256SUMS.txt',
          size: 256,
          browser_download_url:
            'https://github.com/MehmetKoyun0/CONCEPTUS/releases/download/v5.1.0/SHA256SUMS.txt',
        },
      ],
    };

    const res = parseGitHubReleasePayload(payload, '5.0.0');
    expect(res.status).toBe('update_available');
    expect(res.updateAvailable).toBe(true);
    expect(res.latestVersion).toBe('5.1.0');
    expect(res.setupAsset?.name).toBe('CONCEPTUS-Setup-5.1.0.exe');
    expect(res.portableAsset?.name).toBe('CONCEPTUS-5.1.0-Portable.exe');
    expect(res.checksumsUrl).toContain('SHA256SUMS.txt');

    const upToDate = parseGitHubReleasePayload(payload, '5.1.0');
    expect(upToDate.status).toBe('up_to_date');
    expect(upToDate.updateAvailable).toBe(false);
  });

  it('builds valid SHA-256 verified update assets via zero-rate-limit tag redirect fallback', () => {
    const fb = buildReleaseFromTag('v5.3.2', '5.3.0');
    expect(fb.status).toBe('update_available');
    expect(fb.updateAvailable).toBe(true);
    expect(fb.latestVersion).toBe('5.3.2');
    expect(fb.setupAsset?.name).toBe('CONCEPTUS-Setup-5.3.2.exe');
    expect(fb.setupAsset?.url).toBe(
      'https://github.com/MehmetKoyun0/CONCEPTUS/releases/download/v5.3.2/CONCEPTUS-Setup-5.3.2.exe'
    );
    expect(fb.checksumsUrl).toBe(
      'https://github.com/MehmetKoyun0/CONCEPTUS/releases/download/v5.3.2/SHA256SUMS.txt'
    );
    expect(isAllowedUpdateHost(fb.setupAsset!.url)).toBe(true);
  });
});
