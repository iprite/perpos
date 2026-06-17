'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty,
} from '@/components/ui/table';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AdminPage, AdminCard } from '../_components/admin-page';

type Run = {
  id: string;
  ran_at: string;
  duration_ms: number;
  ok: boolean;
  stuck_failed: number;
  requeued: number;
  requeue_gaveup: number;
  cleaned_jobs: number;
  error_message: string | null;
};

type Data = {
  health: 'healthy' | 'stale' | 'down';
  last_ran_at: string | null;
  age_seconds: number | null;
  summary: { runs_24h: number; failed_24h: number; stuck_failed_24h: number; requeued_24h: number; cleaned_24h: number };
  queue: { pending: number; processing: number };
  runs: Run[];
};

const HEALTH = {
  healthy: { label: 'ทำงานปกติ',          cls: 'bg-green-50 border-green-200 text-green-700',  icon: <CheckCircle2 className="h-4 w-4" /> },
  stale:   { label: 'ล่าช้า (>5 นาที)',    cls: 'bg-amber-50 border-amber-200 text-amber-700',  icon: <AlertTriangle className="h-4 w-4" /> },
  down:    { label: 'ไม่ทำงาน (>30 นาที)', cls: 'bg-red-50 border-red-200 text-red-700',        icon: <XCircle className="h-4 w-4" /> },
} as const;

function fmtAge(s: number | null) {
  if (s == null) return 'ยังไม่เคยรัน';
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  if (s < 3600) return `${Math.round(s / 60)} นาทีที่แล้ว`;
  return `${Math.round(s / 3600)} ชม.ที่แล้ว`;
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent ?? 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

export default function SchedulerMonitorPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/scheduler/runs', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } });
      const json = await res.json();
      setData(json?.data ?? null);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const h = data ? HEALTH[data.health] : null;

  return (
    <AdminPage
      width="wide"
      title="Scheduler Monitor"
      icon={<Clock className="h-6 w-6" />}
      description="สถานะ cron scheduler (รันทุก 1 นาที) — stuck jobs, requeue, PDPA cleanup"
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> รีเฟรช
        </Button>
      }
    >
      {loading && !data ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : !data ? (
        <p className="py-10 text-center text-sm text-gray-400">โหลดข้อมูลไม่สำเร็จ</p>
      ) : (
        <div className="space-y-6">
          {/* Health */}
          {h && (
            <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${h.cls}`}>
              {h.icon}
              <span>Scheduler: {h.label}</span>
              <span className="font-normal opacity-80">· รันล่าสุด {fmtAge(data.age_seconds)}</span>
              {data.last_ran_at && <span className="font-normal opacity-60">({fmtTs(data.last_ran_at)})</span>}
            </div>
          )}

          {/* Summary 24h */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="รัน 24 ชม." value={data.summary.runs_24h} />
            <Stat label="รันล้มเหลว" value={data.summary.failed_24h} accent={data.summary.failed_24h > 0 ? 'text-red-600' : undefined} />
            <Stat label="คิวรออยู่" value={data.queue.pending} accent={data.queue.pending > 0 ? 'text-amber-600' : undefined} />
            <Stat label="กำลังประมวลผล" value={data.queue.processing} />
            <Stat label="ปิดงานค้าง (24ช)" value={data.summary.stuck_failed_24h} />
            <Stat label="cleanup (24ช)" value={data.summary.cleaned_24h} />
          </div>

          {/* Run log */}
          <AdminCard title="ประวัติการรันล่าสุด" bodyClassName="p-0">
            <Table wrapperClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead>เวลา</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                  <TableHead align="right">ใช้เวลา</TableHead>
                  <TableHead align="right">ปิดงานค้าง</TableHead>
                  <TableHead align="right">requeue</TableHead>
                  <TableHead align="right">ยอมแพ้</TableHead>
                  <TableHead align="right">cleanup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.runs.length === 0 ? (
                  <TableEmpty colSpan={7}>ยังไม่มีบันทึกการรัน</TableEmpty>
                ) : data.runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-gray-700">{fmtTs(r.ran_at)}</TableCell>
                    <TableCell align="center">
                      {r.ok ? (
                        <StatusBadge tone="success"><CheckCircle2 className="mr-1 h-3 w-3" /> สำเร็จ</StatusBadge>
                      ) : (
                        <StatusBadge tone="danger" title={r.error_message ?? ''}><XCircle className="mr-1 h-3 w-3" /> ล้มเหลว</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell align="right" tabular className="text-gray-600">{r.duration_ms} ms</TableCell>
                    <TableCell align="right" tabular>{r.stuck_failed || '—'}</TableCell>
                    <TableCell align="right" tabular>{r.requeued || '—'}</TableCell>
                    <TableCell align="right" tabular>{r.requeue_gaveup || '—'}</TableCell>
                    <TableCell align="right" tabular>{r.cleaned_jobs || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminCard>
        </div>
      )}
    </AdminPage>
  );
}
