'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/custom-select';
import { StatusBadge, type BadgeTone } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty, TableLoading,
} from '@/components/ui/table';
import { ScrollText } from 'lucide-react';
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

// tone ตามหมวด action
const actionTone = (a: string): BadgeTone => {
  if (a.includes('delete') || a.includes('cancel') || a.includes('deactivate') || a.includes('remove') || a.includes('fail'))
    return 'danger';
  if (a.startsWith('impersonate') || a.includes('reset_password')) return 'warning';
  return 'neutral';
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
        </>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เวลา</TableHead>
            <TableHead>ผู้ดำเนินการ</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>เป้าหมาย</TableHead>
            <TableHead>รายละเอียด</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={6} />
          ) : items.length === 0 ? (
            <TableEmpty colSpan={6}>ยังไม่มีบันทึก</TableEmpty>
          ) : items.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="text-xs text-gray-500">{fmtTime(e.created_at)}</TableCell>
              <TableCell className="text-gray-700">{e.actor_email ?? <span className="text-gray-400">—</span>}</TableCell>
              <TableCell><StatusBadge tone={actionTone(e.action)}>{e.action}</StatusBadge></TableCell>
              <TableCell className="text-gray-700">
                {e.target_label || e.target_id ? (
                  <div>
                    <div>{e.target_label ?? e.target_id}</div>
                    {e.target_type && <div className="text-xs text-gray-400">{e.target_type}</div>}
                  </div>
                ) : <span className="text-gray-400">—</span>}
              </TableCell>
              <TableCell>
                {e.metadata && Object.keys(e.metadata).length > 0 ? (
                  <code className="block max-w-[280px] truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-600" title={JSON.stringify(e.metadata)}>
                    {JSON.stringify(e.metadata)}
                  </code>
                ) : <span className="text-gray-400">—</span>}
              </TableCell>
              <TableCell className="text-xs text-gray-400">{e.ip_address ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
