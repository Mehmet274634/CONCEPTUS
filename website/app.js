const GITHUB_REPO = 'Mehmet274634/CONCEPTUS';
const VERSION = '4.2.0';

function setLang(lang) {
  const active = lang === 'en' ? 'en' : 'tr';
  document.documentElement.lang = active;

  document.querySelectorAll('[data-tr][data-en]').forEach((el) => {
    const val = active === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-tr');
    if (val !== null) el.textContent = val;
  });

  document.querySelectorAll('.lang button[data-lang]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === active);
  });

  try {
    localStorage.setItem('conceptus_site_lang', active);
  } catch {
    // ignore storage failures
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
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
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

function initOsTabs() {
  const buttons = document.querySelectorAll('[data-os-tab]');
  const panels = document.querySelectorAll('[data-os-panel]');
  if (!buttons.length || !panels.length) return;

  const activate = (os) => {
    const target = os === 'macos' || os === 'linux' ? os : 'windows';
    buttons.forEach((b) =>
      b.classList.toggle('active', b.getAttribute('data-os-tab') === target)
    );
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
    document.querySelectorAll('details.dd[open], details.mobile-menu[open]').forEach((d) => {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });
}

function wireReleaseUrls() {
  const base = `https://github.com/${GITHUB_REPO}`;
  const setup = `${base}/releases/latest/download/CONCEPTUS-Setup-${VERSION}.exe`;
  const portable = `${base}/releases/latest/download/CONCEPTUS-${VERSION}-Portable.exe`;
  const sums = `${base}/releases/latest/download/SHA256SUMS.txt`;

  document.querySelectorAll('[data-href="setup"]').forEach((a) => a.setAttribute('href', setup));
  document.querySelectorAll('[data-href="portable"]').forEach((a) => a.setAttribute('href', portable));
  document.querySelectorAll('[data-href="sums"]').forEach((a) => a.setAttribute('href', sums));
  document.querySelectorAll('[data-href="repo"]').forEach((a) => a.setAttribute('href', base));
  document.querySelectorAll('[data-href="releases"]').forEach((a) => a.setAttribute('href', `${base}/releases`));
  document.querySelectorAll('[data-href="security"]').forEach((a) => a.setAttribute('href', `${base}/blob/main/SECURITY.md`));
  document.querySelectorAll('[data-href="license"]').forEach((a) => a.setAttribute('href', `${base}/blob/main/LICENSE`));
}

wireReleaseUrls();
initLanguage();
initSpotlightCards();
initScrollReveal();
initCopyButtons();
initOsTabs();
initDropdownAutoClose();
