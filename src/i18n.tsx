import { createContext, useContext, useState, type ReactNode } from 'react';

export type AppLang = 'tr' | 'en';

interface I18nContextValue {
  lang: AppLang;
  setLang: (lang: AppLang) => void;
  t: (tr: string, en: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'tr',
  setLang: () => {},
  t: (tr) => tr,
});

function detectInitialLang(): AppLang {
  try {
    const saved = localStorage.getItem('conceptus_lang');
    if (saved === 'en' || saved === 'tr') return saved;
  } catch {
    // ignore
  }
  return 'tr';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(detectInitialLang);

  const setLang = (next: AppLang) => {
    setLangState(next);
    try {
      localStorage.setItem('conceptus_lang', next);
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
  };

  const t = (tr: string, en: string) => (lang === 'en' ? en : tr);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
