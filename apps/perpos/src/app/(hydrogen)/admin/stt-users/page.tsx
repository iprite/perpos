'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RefreshCw, Mic, Pencil, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type SttUser = {
  profile_id: string;
  display_name: string;
  picture_url: string | null;
  claimed: boolean;
  email: string | null;
  is_active: boolean;
  created_at: string;
  limit_seconds: number;
  used_seconds: number;
  remaining_seconds: number;
};

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

const min = (s: number) => Math.floor(s / 60);

function Avatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const letter = (name || 'L').charAt(0).toUpperCase();
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-600">
      {letter}
    </div>
  );
}

export default function SttUsersPage() {
  const [items, setItems] = useState<SttUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<SttUser | null>(null);
  const [limitMin, setLimitMin] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stt-users', { headers: { Authorization: `Bearer ${await authToken()}` } });
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authToken()}` },
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

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <div className="mb-3 rounded-full bg-gray-50 p-4"><Mic className="h-7 w-7 text-gray-300" /></div>
          <p className="text-sm font-medium text-gray-700">ยังไม่มีผู้ใช้ LINE</p>
          <p className="mt-1 text-sm text-gray-400">ผู้ใช้จะปรากฏที่นี่เมื่อแอด LINE OA</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((u) => {
            const pct = u.limit_seconds ? Math.min(100, (u.used_seconds / u.limit_seconds) * 100) : 0;
            const low = u.remaining_seconds <= 0;
            return (
              <div
                key={u.profile_id}
                className={`flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-gray-200 sm:flex-row sm:items-center sm:justify-between ${!u.is_active ? 'opacity-60' : ''}`}
              >
                {/* identity */}
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar src={u.picture_url} name={u.display_name} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-gray-900">{u.display_name}</span>
                      <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${u.is_active ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                        {u.is_active ? 'ใช้งาน' : 'ระงับ'}
                      </span>
                    </div>
                    <div className="truncate text-xs text-gray-400">{u.claimed ? u.email : 'ยังไม่เคลมบัญชี'}</div>
                  </div>
                </div>

                {/* quota + actions */}
                <div className="flex flex-wrap items-center gap-4 sm:shrink-0 sm:justify-end">
                  <div className="min-w-[140px]">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-gray-400">โควต้า</span>
                      <span className="whitespace-nowrap tabular-nums text-gray-700">
                        <span className={low ? 'font-semibold text-red-600' : 'font-semibold text-gray-900'}>{min(u.remaining_seconds)}</span>
                        <span className="text-gray-400"> / {min(u.limit_seconds)} นาที</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full rounded-full ${low ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEdit(u); setLimitMin(String(min(u.limit_seconds))); }}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> โควต้า
                    </Button>
                    <Button variant={u.is_active ? 'destructive' : 'secondary'} size="sm" onClick={() => toggleActive(u)}>
                      {u.is_active ? 'ระงับ' : 'เปิด'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
