'use client';

import { useState, useEffect, useRef } from 'react';
import { Globe, ChevronDown } from 'lucide-react';

type Lang = 'th' | 'en' | 'cn';

const STORAGE_KEY = 'usvilla_lang';

const OPTIONS: { code: Lang; label: string }[] = [
  { code: 'th', label: 'ไทย' },
  { code: 'en', label: 'EN' },
  { code: 'cn', label: '中文' },
];

function readLang(): Lang {
  if (typeof window === 'undefined') return 'th';
  return (localStorage.getItem(STORAGE_KEY) as Lang) || 'th';
}

export function UsvillaLangDropdown() {
  const [lang, setLangState] = useState<Lang>('th');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLangState(readLang());

    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) setLangState(e.newValue as Lang);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const changeLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: l }));
    setOpen(false);
  };

  const current = OPTIONS.find((o) => o.code === lang) ?? OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
      >
        <Globe className="h-3.5 w-3.5 text-slate-400" />
        <span>{current.label}</span>
        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-28 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {OPTIONS.map((opt) => (
            <button
              key={opt.code}
              onClick={() => changeLang(opt.code)}
              className={[
                'flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50',
                lang === opt.code ? 'font-semibold text-indigo-600 bg-indigo-50/50' : 'text-slate-700',
              ].join(' ')}
            >
              {opt.label}
              {lang === opt.code && <span className="ml-auto text-indigo-500">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
