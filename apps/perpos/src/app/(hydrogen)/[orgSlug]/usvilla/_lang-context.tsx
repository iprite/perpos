'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { type Lang, type Dict, getDict, getSavedLang, saveLang } from './_i18n';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const Ctx = createContext<LangCtx>({ lang: 'th', setLang: () => {}, t: getDict('th') });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('th');

  useEffect(() => {
    setLangState(getSavedLang());

    // Sync when header dropdown changes localStorage from outside this context tree
    const handler = (e: StorageEvent) => {
      if (e.key === 'usvilla_lang' && e.newValue) {
        setLangState(e.newValue as Lang);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    saveLang(l);
    // Notify other components (e.g. outside this context tree) via storage event
    window.dispatchEvent(new StorageEvent('storage', { key: 'usvilla_lang', newValue: l }));
  };

  return (
    <Ctx.Provider value={{ lang, setLang, t: getDict(lang) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLang() {
  return useContext(Ctx);
}
