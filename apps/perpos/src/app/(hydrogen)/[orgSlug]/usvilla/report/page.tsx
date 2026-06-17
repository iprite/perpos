'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, FileBarChart } from 'lucide-react';
import { PageShell } from '@/components/ui/page-shell';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import Dashboard, { type DashboardData } from '../dashboard';
import { useUsvillaBootstrap, todayStr, addDays, formatThaiDate } from '../_use-usvilla';
import { useLang } from '../_lang-context';

export default function ReportPage() {
  const { t } = useLang();
  const { orgId, token, bootError } = useUsvillaBootstrap();
  const [date, setDate]       = useState(todayStr);
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    if (!orgId || !token) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/usvilla/dashboard?orgId=${orgId}&date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setData(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [orgId, token, date]);

  useEffect(() => { if (orgId && token) load(); }, [orgId, token, load]);

  const errMsg = bootError || error;

  return (
    <PageShell
      width="wide"
      icon={<FileBarChart className="h-6 w-6" />}
      title={t.title_report}
      description={t.subtitle_report}
    >
      {errMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{errMsg}
        </div>
      )}

      {/* Date nav */}
      <div className="flex items-center gap-3 bg-white rounded-xl border px-4 py-2.5">
        <button onClick={() => setDate((d) => addDays(d, -1))} className="p-1 rounded hover:bg-slate-100">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">{formatThaiDate(date)}</span>
        <ThaiDatePicker value={date} onChange={setDate} placeholder="เลือกวัน" />
        {date !== todayStr() && (
          <button onClick={() => setDate(todayStr())} className="text-xs text-indigo-600 hover:underline">{t.btn_today}</button>
        )}
        <button onClick={() => setDate((d) => addDays(d, 1))} className="p-1 rounded hover:bg-slate-100">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading || !data ? (
        <div className="flex h-64 items-center justify-center bg-white rounded-xl border">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <Dashboard data={data} />
      )}
    </PageShell>
  );
}
