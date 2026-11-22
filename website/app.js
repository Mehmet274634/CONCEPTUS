const GITHUB_REPO = 'Mehmet274634/CONCEPTUS';
const VERSION = '5.3.2';
const RELEASE_CACHE_KEY = 'conceptus_latest_release_v1';
const RELEASE_CACHE_TTL_MS = 15 * 60 * 1000;
let activeRelease = null;

function setLang(lang) {
  const active = lang === 'en' ? 'en' : 'tr';
  document.documentElement.lang = active;
  const isDownload = window.location.pathname.includes('download');
  document.title = isDownload
    ? active === 'en'
      ? 'CONCEPTUS — Download Desktop Studio (Windows · macOS · Linux)'
      : 'CONCEPTUS — Masaüstü Stüdyosunu İndir (Windows · macOS · Linux)'
    : active === 'en'
      ? 'CONCEPTUS — Turn a Two-Sentence Idea Into Production App Blueprints'
      : "CONCEPTUS — İki Cümlelik Fikrini Profesyonel Uygulama MD'sine Dönüştür";

  document.querySelectorAll('[data-tr][data-en]').forEach((el) => {
    const val = active === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-tr');
    if (val !== null) el.textContent = val;
  });

  document.querySelectorAll('.lang button[data-lang]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === active);
  });

  if (activeRelease) {
    wireReleaseUrls(activeRelease);
  }

  try {
    localStorage.setItem('conceptus_site_lang', active);
  } catch {
    // ignore
  }
}

function initLanguage() {
  document.querySelectorAll('.lang button[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.getAttribute('data-lang')));
  });

  let initial = 'tr';
  const qsLang = new URLSearchParams(window.location.search).get('lang');
  if (qsLang === 'en' || qsLang === 'tr') {
    initial = qsLang;
  } else {
    try {
      const saved = localStorage.getItem('conceptus_site_lang');
      if (saved === 'en' || saved === 'tr') initial = saved;
    } catch {
      // ignore
    }
  }
  setLang(initial);
}

function initSpotlightCards() {
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
  });
}

function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
  );
  items.forEach((el) => io.observe(el));
}

function initCopyButtons() {
  document.querySelectorAll('.copy[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(text);
        const isEn = document.documentElement.lang === 'en';
        btn.textContent = isEn ? 'Copied' : 'Kopyalandı';
        setTimeout(() => {
          btn.textContent = isEn ? 'Copy' : 'Kopyala';
        }, 1600);
      } catch {
        // ignore
      }
    });
  });
}

// Generic tab group helper (Evolution Forge, 5-File Blueprint Inspector, Sade/Pro, Quota Policy)
function initTabGroup(btnAttr, panelAttr) {
  const btns = document.querySelectorAll(`[${btnAttr}]`);
  const panels = document.querySelectorAll(`[${panelAttr}]`);
  if (!btns.length || !panels.length) return;

  const activate = (id) => {
    btns.forEach((b) => {
      const active = b.getAttribute(btnAttr) === id;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    panels.forEach((p) => {
      p.classList.toggle('active', p.getAttribute(panelAttr) === id);
    });
  };

  btns.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.getAttribute(btnAttr)));
  });
}

// Interactive Human Decision Gate click demo inside Hero Forge
function initDecisionGateDemo() {
  const opts = document.querySelectorAll('[data-gate-opt]');
  const statusEl = document.getElementById('gate-lock-status');
  if (!opts.length) return;
  opts.forEach((opt) => {
    opt.addEventListener('click', () => {
      opts.forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      if (statusEl) {
        const isEn = document.documentElement.lang === 'en';
        const key = opt.getAttribute('data-gate-opt');
        const trMsg =
          key === 'A'
            ? 'Kilitlendi: Seçenek A (%100 Yerel IndexedDB · 0₺)'
            : 'Kilitlendi: Seçenek B (Bulut Senkronizasyon + Hesap)';
        const enMsg =
          key === 'A'
            ? 'Locked: Option A (100% Local IndexedDB · $0/mo)'
            : 'Locked: Option B (Cloud Sync + Account)';
        statusEl.setAttribute('data-tr', trMsg);
        statusEl.setAttribute('data-en', enMsg);
        statusEl.textContent = isEn ? enMsg : trMsg;
      }
    });
  });
}

function initOsTabs() {
  const buttons = document.querySelectorAll('[data-os-tab]');
  const panels = document.querySelectorAll('[data-os-panel]');
  if (!buttons.length || !panels.length) return;

  const activate = (os) => {
    const target = os === 'macos' || os === 'linux' ? os : 'windows';
    buttons.forEach((b) => {
      const isActive = b.getAttribute('data-os-tab') === target;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
    });
    panels.forEach((p) =>
      p.classList.toggle('active', p.getAttribute('data-os-panel') === target)
    );
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const os = btn.getAttribute('data-os-tab') || 'windows';
      activate(os);
      const url = new URL(window.location.href);
      url.searchParams.set('os', os);
      window.history.replaceState({}, '', url);
    });
  });

  const qsOs = new URLSearchParams(window.location.search).get('os');
  if (qsOs) {
    activate(qsOs.toLowerCase());
  } else {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) activate('macos');
    else if (ua.includes('linux') && !ua.includes('android')) activate('linux');
    else activate('windows');
  }
}

function initDropdownAutoClose() {
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.mobile-menu[open]').forEach((d) => {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });
}

function formatSizeMB(bytes) {
  if (!bytes || bytes <= 0) return '';
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function wireReleaseUrls(rel) {
  const base = `https://github.com/${GITHUB_REPO}`;
  const ver = (rel && rel.version) || VERSION;
  const setup = (rel && rel.setupUrl) || `${base}/releases/latest/download/CONCEPTUS-Setup-${ver}.exe`;
  const portable = (rel && rel.portableUrl) || `${base}/releases/latest/download/CONCEPTUS-${ver}-Portable.exe`;
  const sums = (rel && rel.sumsUrl) || `${base}/releases/latest/download/SHA256SUMS.txt`;
  const releasePage = (rel && rel.releaseUrl) || `${base}/releases`;

  document.querySelectorAll('[data-href="setup"]').forEach((a) => a.setAttribute('href', setup));
  document.querySelectorAll('[data-href="portable"]').forEach((a) => a.setAttribute('href', portable));
  document.querySelectorAll('[data-href="sums"]').forEach((a) => a.setAttribute('href', sums));
  document.querySelectorAll('[data-href="repo"]').forEach((a) => a.setAttribute('href', base));
  document.querySelectorAll('[data-href="releases"]').forEach((a) => a.setAttribute('href', releasePage));
  document.querySelectorAll('[data-href="security"]').forEach((a) => a.setAttribute('href', `${base}/blob/main/SECURITY.md`));
  document.querySelectorAll('[data-href="license"]').forEach((a) => a.setAttribute('href', `${base}/blob/main/LICENSE`));

  const isEn = document.documentElement.lang === 'en';
  const setupMB = rel && rel.setupSize ? ` (${formatSizeMB(rel.setupSize)})` : ' (118 MB)';
  const portableMB = rel && rel.portableSize ? ` (${formatSizeMB(rel.portableSize)})` : ' (108 MB)';
  const setupFilename = (rel && rel.setupName) || `CONCEPTUS-Setup-${ver}.exe`;

  document.querySelectorAll('[data-release-version]').forEach((el) => {
    el.textContent = `v${ver}`;
  });
  document.querySelectorAll('[data-release-version-full]').forEach((el) => {
    el.textContent = `CONCEPTUS v${ver}`;
  });
  document.querySelectorAll('[data-setup-label]').forEach((el) => {
    const tr = `Setup ${ver} İndir${setupMB}`;
    const en = `Download Setup ${ver}${setupMB}`;
    el.setAttribute('data-tr', tr);
    el.setAttribute('data-en', en);
    el.textContent = isEn ? en : tr;
  });
  document.querySelectorAll('[data-setup-cta-label]').forEach((el) => {
    const tr = `Windows Setup ${ver} İndir`;
    const en = `Download Windows Setup ${ver}`;
    el.setAttribute('data-tr', tr);
    el.setAttribute('data-en', en);
    el.textContent = isEn ? en : tr;
  });
  document.querySelectorAll('[data-portable-label]').forEach((el) => {
    const tr = `Portable .exe${portableMB}`;
    const en = `Portable .exe${portableMB}`;
    el.setAttribute('data-tr', tr);
    el.setAttribute('data-en', en);
    el.textContent = isEn ? en : tr;
  });

  const shaCmd = `Get-FileHash .\\${setupFilename} -Algorithm SHA256`;
  document.querySelectorAll('[data-sha-copy]').forEach((btn) => {
    btn.setAttribute('data-copy', shaCmd);
  });
  document.querySelectorAll('[data-sha-cmd]').forEach((el) => {
    el.textContent = shaCmd;
  });

  const syncBadge = document.querySelector('[data-live-sync-status]');
  if (syncBadge && rel) {
    const dt = rel.publishedAt
      ? new Date(rel.publishedAt).toLocaleDateString(isEn ? 'en-US' : 'tr-TR', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';
    const tr = dt ? `Canlı Sürüm · v${ver} (${dt})` : `Canlı Sürüm · v${ver}`;
    const en = dt ? `Live Release · v${ver} (${dt})` : `Live Release · v${ver}`;
    syncBadge.setAttribute('data-tr', tr);
    syncBadge.setAttribute('data-en', en);
    syncBadge.textContent = isEn ? en : tr;
  }

  const notesWrap = document.querySelector('[data-release-notes-wrap]');
  const notesBody = document.querySelector('[data-release-notes-body]');
  if (notesWrap && notesBody && rel && rel.notes) {
    notesBody.textContent = rel.notes.slice(0, 1800);
    notesWrap.hidden = false;
  }
}

async function syncLatestGitHubRelease() {
  // 1. Apply cached release immediately to avoid visual flicker
  try {
    const raw = localStorage.getItem(RELEASE_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && cached.data && Date.now() - cached.at < RELEASE_CACHE_TTL_MS) {
        activeRelease = cached.data;
        wireReleaseUrls(activeRelease);
      }
    }
  } catch {
    // ignore storage errors
  }

  // 2. Refresh live from official GitHub Releases API (zero tracking, public read-only)
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return;
    const data = await res.json();
    const version = String(data.tag_name || '').replace(/^v/i, '').trim() || VERSION;
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const setupAsset = assets.find((a) => /CONCEPTUS-Setup-.*\.exe$/i.test(a.name || ''));
    const portableAsset = assets.find((a) => /CONCEPTUS-.*Portable\.exe$/i.test(a.name || ''));
    const sumsAsset = assets.find((a) => /^SHA256SUMS\.txt$/i.test(a.name || ''));

    activeRelease = {
      version,
      releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      publishedAt: data.published_at || '',
      notes: String(data.body || '').trim(),
      setupUrl: setupAsset ? setupAsset.browser_download_url : '',
      setupName: setupAsset ? setupAsset.name : `CONCEPTUS-Setup-${version}.exe`,
      setupSize: setupAsset ? Number(setupAsset.size || 0) : 0,
      portableUrl: portableAsset ? portableAsset.browser_download_url : '',
      portableSize: portableAsset ? Number(portableAsset.size || 0) : 0,
      sumsUrl: sumsAsset ? sumsAsset.browser_download_url : '',
    };

    try {
      localStorage.setItem(
        RELEASE_CACHE_KEY,
        JSON.stringify({ at: Date.now(), data: activeRelease })
      );
    } catch {
      // ignore
    }

    wireReleaseUrls(activeRelease);
  } catch {
    // Keep clean static fallback
  }
}

function initHeroLightCanvas() {
  const canvases = document.querySelectorAll('canvas[data-light-canvas]');
  if (!canvases.length) return;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  canvases.forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const variant = canvas.getAttribute('data-light-canvas') || 'hero';
    const isSub = variant === 'sub';
    let w = 0;
    let h = 0;
    let dpr = 1;
    let visible = true;
    let rafId = 0;
    let mouseX = 0.5;
    let mouseY = 0.5;
    let targetX = 0.5;
    let targetY = 0.5;

    const beamCount = isSub ? 14 : 24;
    const beams = Array.from({ length: beamCount }, (_, i) => {
      const norm = (i + 0.5) / beamCount;
      const centerDist = Math.abs(norm - 0.5) * 2;
      const palette = i % 3 === 0 ? [124, 116, 255] : i % 3 === 1 ? [63, 208, 201] : [186, 198, 255];
      return {
        norm,
        centerDist,
        color: palette,
        width: (1 - centerDist * 0.55) * (isSub ? 2.0 : 2.8) + 0.8,
        speed: 0.25 + (i % 5) * 0.11,
        phase: i * 1.17,
        streakOffset: (i * 0.29) % 1,
        streakSpeed: 0.065 + (i % 4) * 0.024,
      };
    });

    const sparkCount = isSub ? 26 : 56;
    const sparks = Array.from({ length: sparkCount }, (_, i) => ({
      x: ((i * 73.13) % 100) / 100,
      y: ((i * 41.79) % 100) / 100,
      r: 0.9 + (i % 4) * 0.48,
      vy: 0.00055 + (i % 5) * 0.00024,
      drift: ((i % 7) - 3) * 0.00009,
      phase: i * 0.83,
      color: i % 3 === 0 ? '124,116,255' : i % 3 === 1 ? '63,208,201' : '240,244,255',
    }));

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = Math.max(320, rect.width);
      h = Math.max(260, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawFrame(tSec) {
      mouseX += (targetX - mouseX) * 0.05;
      mouseY += (targetY - mouseY) * 0.05;

      ctx.clearRect(0, 0, w, h);
      const px = (mouseX - 0.5) * (isSub ? 24 : 52);
      const py = (mouseY - 0.5) * (isSub ? 14 : 28);

      // 1. Ambient obsidian-horizon aurora glow (feathered safely above bottom edge)
      const horizonY = isSub ? h * 0.68 : h * 0.78;
      const g1 = ctx.createRadialGradient(w * 0.42 + px, horizonY + py * 0.4, 12, w * 0.42 + px, horizonY, w * 0.52);
      g1.addColorStop(0, 'rgba(124, 116, 255, 0.32)');
      g1.addColorStop(0.45, 'rgba(124, 116, 255, 0.1)');
      g1.addColorStop(1, 'rgba(8, 9, 10, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createRadialGradient(w * 0.62 - px * 0.8, horizonY * 0.94, 10, w * 0.62 - px * 0.8, horizonY, w * 0.46);
      g2.addColorStop(0, 'rgba(63, 208, 201, 0.24)');
      g2.addColorStop(0.48, 'rgba(63, 208, 201, 0.07)');
      g2.addColorStop(1, 'rgba(8, 9, 10, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // 2. Volumetric rising convergence light rays (fading smoothly at both bottom and top)
      beams.forEach((b) => {
        const baseX = w * (0.06 + b.norm * 0.88) + px * (0.45 - b.centerDist * 0.2);
        const topSpread = (b.norm - 0.5) * w * 0.14;
        const topX = baseX + topSpread;
        const pulse = 0.52 + 0.48 * Math.sin(tSec * b.speed + b.phase);
        const alpha = (1 - b.centerDist * 0.62) * (isSub ? 0.17 : 0.22) * pulse;
        const [r, g, bl] = b.color;

        // Soft ambient shaft (feathered to 0 at bottom and top)
        const shaft = ctx.createLinearGradient(baseX, h, topX, h * 0.04);
        shaft.addColorStop(0, `rgba(${r},${g},${bl},0)`);
        shaft.addColorStop(0.24, `rgba(${r},${g},${bl},${alpha * 0.95})`);
        shaft.addColorStop(0.62, `rgba(${r},${g},${bl},${alpha * 0.34})`);
        shaft.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        ctx.strokeStyle = shaft;
        ctx.lineWidth = b.width * 3.4;
        ctx.beginPath();
        ctx.moveTo(baseX, h);
        ctx.lineTo(topX, h * 0.04);
        ctx.stroke();

        // Crisp luminous core hairline (also feathered cleanly)
        const coreGrad = ctx.createLinearGradient(baseX, h, topX, h * 0.06);
        coreGrad.addColorStop(0, `rgba(${r},${g},${bl},0)`);
        coreGrad.addColorStop(0.26, `rgba(${r},${g},${bl},${alpha * 1.45})`);
        coreGrad.addColorStop(0.75, `rgba(${r},${g},${bl},${alpha * 0.35})`);
        coreGrad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        ctx.strokeStyle = coreGrad;
        ctx.lineWidth = Math.max(0.8, b.width * 0.48);
        ctx.beginPath();
        ctx.moveTo(baseX, h);
        ctx.lineTo(topX, h * 0.06);
        ctx.stroke();

        // Rising bright light packet riding up each ray
        const prog = (b.streakOffset + tSec * b.streakSpeed) % 1;
        const yEnd = h * (1 - prog * 0.92);
        const yStart = Math.min(h, yEnd + h * 0.16);
        const ratioStart = (h - yStart) / (h * 0.94);
        const ratioEnd = (h - yEnd) / (h * 0.94);
        const sx = baseX + topSpread * ratioStart;
        const ex = baseX + topSpread * ratioEnd;
        const fade = Math.sin(prog * Math.PI);

        const streakGrad = ctx.createLinearGradient(sx, yStart, ex, yEnd);
        streakGrad.addColorStop(0, `rgba(${r},${g},${bl},0)`);
        streakGrad.addColorStop(0.7, `rgba(${r},${g},${bl},${0.55 * fade})`);
        streakGrad.addColorStop(1, `rgba(255,255,255,${0.85 * fade})`);
        ctx.strokeStyle = streakGrad;
        ctx.lineWidth = Math.max(1.2, b.width * 0.65);
        ctx.beginPath();
        ctx.moveTo(sx, yStart);
        ctx.lineTo(ex, yEnd);
        ctx.stroke();
      });

      // 3. Three living luminous horizon ribbons (Violet, Cyan, Starlight)
      const ribbons = isSub
        ? [
            { y: h * 0.6, amp: 14, freq: 1.5, spd: 0.45, col: '124,116,255', a: 0.22 },
            { y: h * 0.66, amp: 11, freq: 2.1, spd: -0.38, col: '63,208,201', a: 0.18 },
          ]
        : [
            { y: h * 0.67, amp: 24, freq: 1.4, spd: 0.45, col: '124,116,255', a: 0.32 },
            { y: h * 0.72, amp: 20, freq: 1.9, spd: -0.35, col: '63,208,201', a: 0.26 },
            { y: h * 0.76, amp: 14, freq: 2.4, spd: 0.55, col: '240,180,76', a: 0.15 },
          ];

      ribbons.forEach((rb) => {
        const rg = ctx.createLinearGradient(0, 0, w, 0);
        rg.addColorStop(0, `rgba(${rb.col},0)`);
        rg.addColorStop(0.22, `rgba(${rb.col},${rb.a})`);
        rg.addColorStop(0.5, `rgba(255,255,255,${rb.a * 1.15})`);
        rg.addColorStop(0.78, `rgba(${rb.col},${rb.a})`);
        rg.addColorStop(1, `rgba(${rb.col},0)`);

        ctx.strokeStyle = rg;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 18) {
          const nx = x / w;
          const env = Math.sin(nx * Math.PI);
          const y =
            rb.y +
            Math.sin(nx * Math.PI * rb.freq + tSec * rb.spd) * rb.amp * env +
            py * 0.35 * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      // 4. Crisp luminous horizon rim arc on main hero
      if (!isSub) {
        const rimGrad = ctx.createLinearGradient(w * 0.12, 0, w * 0.88, 0);
        rimGrad.addColorStop(0, 'rgba(124,116,255,0)');
        rimGrad.addColorStop(0.32, 'rgba(124,116,255,0.42)');
        rimGrad.addColorStop(0.5, 'rgba(255,255,255,0.72)');
        rimGrad.addColorStop(0.68, 'rgba(63,208,201,0.42)');
        rimGrad.addColorStop(1, 'rgba(63,208,201,0)');

        ctx.strokeStyle = rimGrad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.84);
        ctx.quadraticCurveTo(w * 0.5 + px * 0.4, h * 0.71, w * 0.92, h * 0.84);
        ctx.stroke();
      }

      // 5. Rising starlight micro-sparks
      sparks.forEach((s) => {
        if (!reduceMotion) {
          s.y -= s.vy;
          s.x += s.drift;
          if (s.y < -0.04) {
            s.y = 1.04;
            s.x = (s.x + 0.37) % 1;
          }
          if (s.x < 0) s.x += 1;
          if (s.x > 1) s.x -= 1;
        }
        const sx = s.x * w + px * 0.25;
        const sy = s.y * h;
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(tSec * 1.4 + s.phase));
        const edgeFade = Math.sin(Math.max(0, Math.min(1, s.y)) * Math.PI);
        const alpha = twinkle * edgeFade * 0.78;

        ctx.fillStyle = `rgba(${s.color},${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
    }

    function loop(now) {
      if (!visible) return;
      drawFrame(now * 0.001);
      if (!reduceMotion) {
        rafId = requestAnimationFrame(loop);
      }
    }

    resize();
    drawFrame(1.4);

    if (!reduceMotion) {
      rafId = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize, { passive: true });
    canvas.parentElement.addEventListener(
      'pointermove',
      (e) => {
        const rect = canvas.parentElement.getBoundingClientRect();
        targetX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        targetY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      },
      { passive: true }
    );

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          visible = entries[0].isIntersecting;
          if (visible && !reduceMotion && !rafId) {
            rafId = requestAnimationFrame(loop);
          } else if (!visible && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }
        },
        { threshold: 0.02 }
      );
      io.observe(canvas.parentElement);
    }
  });
}

wireReleaseUrls();
initLanguage();
syncLatestGitHubRelease();
initSpotlightCards();
initScrollReveal();
initCopyButtons();
initTabGroup('data-forge-tab', 'data-forge-panel');
initTabGroup('data-bp-tab', 'data-bp-doc');
initTabGroup('data-ui-tab', 'data-ui-pane');
initTabGroup('data-pol-tab', 'data-pol-pane');
initDecisionGateDemo();
initOsTabs();
initDropdownAutoClose();
initHeroLightCanvas();
