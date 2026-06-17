'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/custom-select';
import { ShieldCheck, RefreshCw, Loader2, ScrollText } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AdminPage } from '../_components/admin-page';

type Entry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

// ป้ายสีตามหมวด action
const actionStyle = (a: string): string => {
  if (a.includes('delete') || a.includes('cancel') || a.includes('deactivate') || a.includes('remove') || a.includes('fail'))
    return 'border-red-200 bg-red-50 text-red-700';
  if (a.startsWith('impersonate')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (a.includes('reset_password')) return 'border-orange-200 bg-orange-50 text-orange-700';
  return 'border-gray-200 bg-gray-50 text-gray-600';
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function AdminAuditPage() {
  const [items, setItems] = useState<Entry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (action) qs.set('action', action);
      const res = await fetch(`/api/admin/admin-audit?${qs}`, { headers: { Authorization: `Bearer ${await authToken()}` } });
      if (res.ok) {
        const d = (await res.json()).data;
        setItems((d?.items ?? []) as Entry[]);
        setTotal(d?.total ?? 0);
        if (d?.actions?.length) setActions(d.actions as string[]);
      }
    } finally {
      setLoading(false);
    }
  }, [page, action]);
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <AdminPage
      width="wide"
      title="บันทึกการจัดการ (Admin Audit)"
      icon={<ScrollText className="h-6 w-6" />}
      actions={
        <>
          <CustomSelect
            value={action}
            onChange={(v) => { setPage(1); setAction(v); }}
            options={[{ value: '', label: 'ทุก action' }, ...actions.map((a) => ({ value: a, label: a }))]}
            className="w-52"
          />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> รีเฟรช</Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">เวลา</th>
                <th className="px-4 py-3">ผู้ดำเนินการ</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">เป้าหมาย</th>
                <th className="px-4 py-3">รายละเอียด</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีบันทึก</td></tr>
              ) : items.map((e) => (
                <tr key={e.id} className="align-top transition-colors hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{fmtTime(e.created_at)}</td>
                  <td className="px-4 py-3 text-gray-700">{e.actor_email ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${actionStyle(e.action)}`}>{e.action}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {e.target_label || e.target_id ? (
                      <div>
                        <div className="truncate">{e.target_label ?? e.target_id}</div>
                        {e.target_type && <div className="text-xs text-gray-400">{e.target_type}</div>}
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {e.metadata && Object.keys(e.metadata).length > 0 ? (
                      <code className="block max-w-[280px] truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-600" title={JSON.stringify(e.metadata)}>
                        {JSON.stringify(e.metadata)}
                      </code>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">{e.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <span>ทั้งหมด {total.toLocaleString('th-TH')} รายการ</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>ก่อนหน้า</Button>
          <span className="tabular-nums">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>ถัดไป</Button>
        </div>
      </div>
    </AdminPage>
  );
}
