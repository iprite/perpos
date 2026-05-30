'use client';

import { LANG_OPTIONS, type Lang } from './_i18n';
import { useLang } from './_lang-context';

export default function LangSwitcher() {
  const { lang, setLang } = useLang();

  return (
    <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
      {LANG_OPTIONS.map((opt) => (
        <button
          key={opt.code}
          onClick={() => setLang(opt.code as Lang)}
          className={[
            'px-2.5 py-1 rounded-md text-xs font-semibold transition-all',
            lang === opt.code
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
