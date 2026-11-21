// Update this single constant with your GitHub username/repo before deploying to Vercel / GitHub Pages
const GITHUB_REPO = 'Mehmet274634/CONCEPTUS';
const VERSION = '4.2.0';

function wireReleaseLinks() {
  const base = `https://github.com/${GITHUB_REPO}`;
  const setupUrl = `${base}/releases/latest/download/CONCEPTUS-Setup-${VERSION}.exe`;
  const portableUrl = `${base}/releases/latest/download/CONCEPTUS-${VERSION}-Portable.exe`;

  const setHref = (id, url) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('href', url);
  };

  setHref('github-link', base);
  setHref('footer-gh', base);
  setHref('footer-sec', `${base}/blob/main/SECURITY.md`);
  setHref('footer-lic', `${base}/blob/main/LICENSE`);
  setHref('dl-win-setup', setupUrl);
  setHref('dl-win-portable', portableUrl);
}

function setLanguage(lang) {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-tr][data-en]').forEach((el) => {
    el.textContent = lang === 'en' ? el.dataset.en : el.dataset.tr;
  });
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  try {
    localStorage.setItem('conceptus_web_lang', lang);
  } catch {
    // ignore
  }
}

document.querySelectorAll('.lang-btn').forEach((btn) => {
  btn.addEventListener('click', () => setLanguage(btn.dataset.lang || 'tr'));
});

const copyBtn = document.getElementById('copy-cli-btn');
const cliCmd = document.getElementById('cli-cmd');
if (copyBtn && cliCmd) {
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(cliCmd.textContent || '');
    const isEn = document.documentElement.lang === 'en';
    copyBtn.textContent = isEn ? 'Copied' : 'Kopyalandı';
    setTimeout(() => {
      copyBtn.textContent = isEn ? 'Copy' : 'Kopyala';
    }, 1500);
  });
}

wireReleaseLinks();
const savedLang = (() => {
  try {
    return localStorage.getItem('conceptus_web_lang');
  } catch {
    return null;
  }
})();
setLanguage(savedLang === 'en' ? 'en' : 'tr');
