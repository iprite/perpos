'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/custom-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileAudio, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AdminPage } from '../_components/admin-page';

type Job = {
  id: string;
  profile_id: string | null;
  display_name: string;
  file_name: string;
  file_size: number | null;
  duration_seconds: number | null;
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  source: 'web' | 'line';
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type Counts = Record<'pending' | 'processing' | 'completed' | 'failed', number>;

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

const STATUS_BADGE: Record<Job['status'], string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  processing: 'border-blue-200 bg-blue-50 text-blue-700',
  completed: 'border-green-200 bg-green-50 text-green-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
};
const STATUS_LABEL: Record<Job['status'], string> = {
  pending: 'รอคิว', processing: 'กำลังประมวลผล', completed: 'สำเร็จ', failed: 'ล้มเหลว',
};

const fmtDur = (s: number | null) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const fmtSize = (b: number | null) => (b == null ? '—' : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const isStuck = (j: Job) => (j.status === 'pending' || j.status === 'processing') && Date.now() - new Date(j.created_at).getTime() > 10 * 60 * 1000;

export default function SttJobsPage() {
  const [items, setItems] = useState<Job[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, processing: 0, completed: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [confirmJob, setConfirmJob] = useState<Job | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : '';
      const res = await fetch(`/api/admin/stt-jobs${qs}`, { headers: { Authorization: `Bearer ${await authToken()}` } });
      if (!res.ok) throw new Error('โหลดไม่สำเร็จ');
      const d = (await res.json()).data;
      setItems((d?.items ?? []) as Job[]);
      setCounts((d?.counts ?? { pending: 0, processing: 0, completed: 0, failed: 0 }) as Counts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const failJob = async () => {
    if (!confirmJob) return;
    setActing(true);
    try {
      const res = await fetch('/api/admin/stt-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authToken()}` },
        body: JSON.stringify({ jobId: confirmJob.id, action: 'fail' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? 'ดำเนินการไม่สำเร็จ');
      const refMin = Math.floor((d.data?.refunded_seconds ?? 0) / 60);
      toast.success(refMin > 0 ? `ปิดงานแล้ว — คืนโควต้า ${refMin} นาที` : 'ปิดงานแล้ว');
      setConfirmJob(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setActing(false);
    }
  };

  return (
    <AdminPage
      width="wide"
      title="งานแกะเสียง (Job Monitor)"
      icon={<FileAudio className="h-6 w-6" />}
      actions={
        <>
          <Link href="/admin/stt-stats"><Button variant="outline" size="sm">📊 สถิติ</Button></Link>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> รีเฟรช</Button>
        </>
      }
    >
      {/* summary counts */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['pending', 'processing', 'completed', 'failed'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setStatus(status === k ? '' : k)}
            className={`rounded-xl border p-4 text-left transition-colors ${status === k ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
          >
            <div className="text-2xl font-bold tabular-nums text-gray-900">{counts[k]}</div>
            <div className="text-xs text-gray-500">{STATUS_LABEL[k]}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <CustomSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'ทุกสถานะ' },
            { value: 'pending', label: 'รอคิว' },
            { value: 'processing', label: 'กำลังประมวลผล' },
            { value: 'completed', label: 'สำเร็จ' },
            { value: 'failed', label: 'ล้มเหลว' },
          ]}
          className="w-44"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">ไฟล์ / ผู้ใช้</th>
                <th className="px-4 py-3 text-center">ที่มา</th>
                <th className="px-4 py-3 text-right">ความยาว</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3">สร้างเมื่อ</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">ไม่มีงานในสถานะนี้</td></tr>
              ) : items.map((j) => {
                const stuck = isStuck(j);
                return (
                  <tr key={j.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium text-gray-900">
                        {stuck && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                        <span className="max-w-[260px] truncate">{j.file_name}</span>
                      </div>
                      <div className="text-xs text-gray-400">{j.display_name} · {fmtSize(j.file_size)}</div>
                      {j.error_message && j.status === 'failed' && (
                        <div className="mt-0.5 max-w-[320px] truncate text-xs text-red-500" title={j.error_message}>{j.error_message}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">{j.source === 'line' ? 'LINE' : 'เว็บ'}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtDur(j.duration_seconds)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[j.status]}`}>{STATUS_LABEL[j.status]}</span>
                      {stuck && <div className="mt-0.5 text-[10px] text-amber-600">ค้างเกิน 10 นาที</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtTime(j.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {(j.status === 'pending' || j.status === 'processing') ? (
                        <Button variant="destructive" size="sm" onClick={() => setConfirmJob(j)}>ปิดงาน + คืนโควต้า</Button>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!confirmJob} onOpenChange={(o) => { if (!o) setConfirmJob(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>ปิดงานที่ค้าง + คืนโควต้า</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm text-gray-600">
            <p>ปิดงาน <span className="font-medium text-gray-900">{confirmJob?.file_name}</span> เป็นสถานะ &ldquo;ล้มเหลว&rdquo; และคืนโควต้าที่หักไปแล้วให้ <span className="font-medium text-gray-900">{confirmJob?.display_name}</span></p>
            <p className="text-xs text-amber-600">ใช้กับงานที่ค้างเพราะ worker ไม่ตอบกลับ — การกระทำนี้ย้อนกลับไม่ได้</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmJob(null)}>ยกเลิก</Button>
            <Button variant="destructive" onClick={failJob} disabled={acting}>{acting ? 'กำลังดำเนินการ…' : 'ปิดงาน + คืนโควต้า'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
