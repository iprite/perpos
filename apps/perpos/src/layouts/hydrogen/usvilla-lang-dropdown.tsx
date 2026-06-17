'use client';

import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { Dropdown, type DropdownItem } from '@/components/ui/dropdown';

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

  useEffect(() => {
    setLangState(readLang());

    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) setLangState(e.newValue as Lang);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const changeLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: l }));
  };

  const current = OPTIONS.find((o) => o.code === lang) ?? OPTIONS[0];

  const items: DropdownItem[] = OPTIONS.map((opt) => ({
    key: opt.code,
    label: opt.label,
    onClick: () => changeLang(opt.code),
  }));

  return (
    <Dropdown
      label={current.label}
      leadingIcon={<Globe className="h-3.5 w-3.5" />}
      selectedKey={lang}
      items={items}
      placement="bottom-end"
    />
  );
}
