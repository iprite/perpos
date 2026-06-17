'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Server, RefreshCw, Loader2, Cpu, Clock, Plug, CheckCircle2, XCircle, AlertTriangle, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AdminPage, AdminCard } from '../_components/admin-page';

type EnvCheck = { key: string; present: boolean };
type Service = {
  id: string;
  name: string;
  kind: 'worker' | 'scheduler' | 'integration';
  purpose: string;
  stack: string;
  platform: string;
  region: string | null;
  secrets: EnvCheck[];
  configs: EnvCheck[];
  configured: boolean;
  status: string;
  latency_ms?: number | null;
  url_env?: string;
  last_ran_at?: string | null;
};

const STATUS: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  up:             { label: 'ทำงาน',        cls: 'bg-green-50 border-green-200 text-green-700',  icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  configured:     { label: 'ตั้งค่าแล้ว',   cls: 'bg-green-50 border-green-200 text-green-700',  icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  stale:          { label: 'ล่าช้า',        cls: 'bg-amber-50 border-amber-200 text-amber-700',  icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  down:           { label: 'ไม่ตอบสนอง',    cls: 'bg-red-50 border-red-200 text-red-700',        icon: <XCircle className="h-3.5 w-3.5" /> },
  not_configured: { label: 'ยังไม่ตั้งค่า',  cls: 'bg-gray-50 border-gray-200 text-gray-500',     icon: <Circle className="h-3.5 w-3.5" /> },
  missing_config: { label: 'env ไม่ครบ',    cls: 'bg-amber-50 border-amber-200 text-amber-700',  icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  unknown:        { label: 'ยังไม่มีข้อมูล', cls: 'bg-gray-50 border-gray-200 text-gray-500',     icon: <Circle className="h-3.5 w-3.5" /> },
};

const KIND_META = {
  worker:      { title: 'Cloud Run Workers', icon: <Cpu className="h-4 w-4" />,  note: 'งานหนักแยกอิสระ — scale-to-zero, ping /health สด' },
  scheduler:   { title: 'Cloud Scheduler',   icon: <Clock className="h-4 w-4" />, note: 'cron จาก GCP ยิงเข้า API' },
  integration: { title: 'Integrations',      icon: <Plug className="h-4 w-4" />,  note: 'บริการภายนอกที่ระบบต่อใช้งาน (เช็คจาก env config)' },
} as const;

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.unknown;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

export default function SystemPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [services, setServices] = useState<Service[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/system/services', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } });
      const json = await res.json();
      setServices(json?.data?.services ?? []);
      setCheckedAt(json?.data?.checked_at ?? null);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const groups: Array<Service['kind']> = ['worker', 'scheduler', 'integration'];

  return (
    <AdminPage
      width="wide"
      title="System / Infrastructure"
      icon={<Server className="h-6 w-6" />}
      description="backend ทั้งหมดที่ระบบต่อใช้งาน — workers, scheduler, integrations พร้อมสถานะสด"
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> ตรวจสอบใหม่
        </Button>
      }
    >
      {loading && services.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-6">
          {checkedAt && (
            <p className="text-xs text-gray-400">ตรวจสอบล่าสุด {new Date(checkedAt).toLocaleTimeString('th-TH')}</p>
          )}

          {groups.map((kind) => {
            const list = services.filter((s) => s.kind === kind);
            if (list.length === 0) return null;
            const meta = KIND_META[kind];
            return (
              <AdminCard
                key={kind}
                title={<span className="flex items-center gap-2">{meta.icon} {meta.title}</span>}
                bodyClassName="p-0"
              >
                <p className="border-b border-gray-100 px-5 py-2 text-xs text-gray-400">{meta.note}</p>
                <div className="divide-y divide-gray-100">
                  {list.map((s) => (
                    <div key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900">{s.name}</span>
                          <StatusBadge status={s.status} />
                          {typeof s.latency_ms === 'number' && (
                            <span className="text-xs tabular-nums text-gray-400">{s.latency_ms} ms</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{s.purpose}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                          <span>{s.platform}{s.region ? ` · ${s.region}` : ''}</span>
                          <span>· {s.stack}</span>
                          {s.kind === 'scheduler' && (
                            <Link href="/admin/scheduler" className="text-indigo-500 hover:underline">ดู Scheduler Monitor →</Link>
                          )}
                        </div>
                      </div>

                      {/* env / config presence */}
                      <div className="flex flex-shrink-0 flex-wrap gap-1.5 sm:max-w-[280px] sm:justify-end">
                        {s.url_env && (
                          <EnvPill ok={!!s.configured} label={s.url_env} />
                        )}
                        {[...s.secrets, ...s.configs].map((e) => (
                          <EnvPill key={e.key} ok={e.present} label={e.key} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </AdminCard>
            );
          })}

          <p className="text-xs text-gray-400">
            * เพิ่ม backend ใหม่ในอนาคต = เพิ่ม 1 entry ใน <code>REGISTRY</code> ที่ <code>api/admin/system/services/route.ts</code> แล้วจะโผล่ที่นี่อัตโนมัติ
          </p>
        </div>
      )}
    </AdminPage>
  );
}

function EnvPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      title={ok ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้ง env นี้'}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
        ok ? 'border-green-200 bg-green-50 text-green-600' : 'border-red-200 bg-red-50 text-red-600'
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}
