'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RefreshCw, Mic, Pencil, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

type SttUser = {
  profile_id: string;
  display_name: string;
  claimed: boolean;
  email: string | null;
  is_active: boolean;
  created_at: string;
  limit_seconds: number;
  used_seconds: number;
  remaining_seconds: number;
};

function getToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = Object.entries(localStorage).find(([k]) => k.includes('supabase') && k.includes('auth'));
    if (!raw) return '';
    return JSON.parse(raw[1])?.access_token ?? '';
  } catch { return ''; }
}

const min = (s: number) => Math.floor(s / 60);

export default function SttUsersPage() {
  const [items, setItems] = useState<SttUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<SttUser | null>(null);
  const [limitMin, setLimitMin] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stt-users', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('โหลดไม่สำเร็จ');
      setItems(((await res.json()).data?.items ?? []) as SttUser[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (profileId: string, payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/stt-users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ profileId, ...payload }),
    });
    if (!res.ok) { toast.error('บันทึกไม่สำเร็จ'); return false; }
    return true;
  };

  const saveQuota = async () => {
    if (!edit) return;
    const m = parseInt(limitMin, 10);
    if (isNaN(m) || m < 0) { toast.error('ระบุจำนวนนาทีให้ถูกต้อง'); return; }
    setSaving(true);
    if (await update(edit.profile_id, { limitSeconds: m * 60 })) {
      toast.success('ปรับโควต้าแล้ว');
      setEdit(null);
      await load();
    }
    setSaving(false);
  };

  const toggleActive = async (u: SttUser) => {
    if (await update(u.profile_id, { isActive: !u.is_active })) {
      toast.success(u.is_active ? 'ระงับผู้ใช้แล้ว' : 'เปิดใช้งานแล้ว');
      await load();
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <Mic className="h-6 w-6 text-indigo-600" /> ผู้ใช้ LINE — ระบบแกะเสียง
        </h1>
        <div className="flex gap-2">
          <Link href="/admin/stt-stats"><Button variant="outline" size="sm">📊 สถิติภาพรวม</Button></Link>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> รีเฟรช
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">ผู้ใช้</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3">โควต้า (นาที)</th>
              <th className="px-4 py-3 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีผู้ใช้ LINE</td></tr>
            ) : items.map((u) => {
              const pct = u.limit_seconds ? Math.min(100, (u.used_seconds / u.limit_seconds) * 100) : 0;
              return (
                <tr key={u.profile_id} className={`transition-colors hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{u.display_name}</div>
                    <div className="text-xs text-gray-400">{u.claimed ? u.email : 'ยังไม่เคลมบัญชี'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${u.is_active ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                      {u.is_active ? 'ใช้งาน' : 'ระงับ'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-gray-700">{min(u.remaining_seconds)} / {min(u.limit_seconds)}</span>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full ${u.remaining_seconds <= 0 ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" className="mr-2" onClick={() => { setEdit(u); setLimitMin(String(min(u.limit_seconds))); }}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> โควต้า
                    </Button>
                    <Button variant={u.is_active ? 'destructive' : 'secondary'} size="sm" onClick={() => toggleActive(u)}>
                      {u.is_active ? 'ระงับ' : 'เปิด'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>ปรับโควต้า — {edit?.display_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="limit">โควต้า (นาที)</Label>
              <Input id="limit" type="number" value={limitMin} onChange={(e) => setLimitMin(e.target.value)} className="mt-1" />
              <p className="mt-1 text-xs text-gray-500">ใช้ไปแล้ว {edit ? min(edit.used_seconds) : 0} นาที — ตั้ง limit ใหม่เพื่อปรับ/เติม</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setEdit(null)}>ยกเลิก</Button>
            <Button onClick={saveQuota} disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
