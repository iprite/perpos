'use client';

/**
 * AnnouncementBanner — แสดงประกาศจากแอดมิน (announcements) เป็น banner ในแอป
 * ดึงจาก /api/announcements/active · ปิดได้รายชิ้น (จำใน localStorage)
 * วางใน hydrogen layout เหนือเนื้อหา — โผล่กับผู้ใช้ที่ล็อกอินทุกคน
 */

import { useEffect, useState } from 'react';
import { X, Info, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Level = 'info' | 'success' | 'warning' | 'critical';
type Item = { id: string; title: string; body: string; level: Level };

const META: Record<Level, { cls: string; icon: React.ReactNode }> = {
  info:     { cls: 'border-blue-200 bg-blue-50 text-blue-800',     icon: <Info className="h-4 w-4" /> },
  success:  { cls: 'border-green-200 bg-green-50 text-green-800',  icon: <CheckCircle2 className="h-4 w-4" /> },
  warning:  { cls: 'border-amber-200 bg-amber-50 text-amber-800', icon: <AlertTriangle className="h-4 w-4" /> },
  critical: { cls: 'border-red-200 bg-red-50 text-red-800',       icon: <AlertOctagon className="h-4 w-4" /> },
};

const STORAGE_KEY = 'perpos.dismissedAnnouncements';

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

export function AnnouncementBanner() {
  const [items, setItems] = useState<Item[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(getDismissed());
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/announcements/active', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) return;
        const json = await res.json();
        setItems(json?.data?.announcements ?? []);
      } catch { /* เงียบ — banner ต้องไม่ทำให้แอปพัง */ }
    })();
  }, []);

  const dismiss = (id: string) => {
    const next = Array.from(new Set([...dismissed, id]));
    setDismissed(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  };

  const visible = items.filter((i) => !dismissed.includes(i.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pt-3 md:px-5 lg:px-6 3xl:px-8 4xl:px-10">
      {visible.map((a) => {
        const m = META[a.level] ?? META.info;
        return (
          <div key={a.id} className={`flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${m.cls}`}>
            <span className="mt-0.5 flex-shrink-0">{m.icon}</span>
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{a.title}</span>
              {a.body && <span className="ml-2 opacity-90">{a.body}</span>}
            </div>
            <button onClick={() => dismiss(a.id)} className="flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100" aria-label="ปิด">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
