'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CalendarCheck, HardDrive, Link2, Loader2, ShieldCheck, Unlink } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AssistantCalendarPage() {
  const supabase = createSupabaseBrowserClient();
  const search = useSearchParams();

  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [autoRemind, setAutoRemind] = useState(false);
  const [saveMom, setSaveMom] = useState(false);
  const [saveAudio, setSaveAudio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token ?? '';
      setToken(accessToken);
      if (!accessToken) return;
      const res = await fetch('/api/assistant/calendar', { headers: { Authorization: `Bearer ${accessToken}` } });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setConnected(Boolean(d.connected)); setAutoRemind(Boolean(d.autoRemind)); setSaveMom(Boolean(d.saveMom)); setSaveAudio(Boolean(d.saveAudio)); }
    } finally {
      setLoading(false);
    }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (search.get('gdrive') === 'connected') toast.success('เชื่อม Google Calendar สำเร็จ');
    else if (search.get('gdrive')) toast.error('เชื่อม Google Calendar ไม่สำเร็จ ลองใหม่อีกครั้ง');
  }, [search]);

  const connect = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch('/api/google-drive/connect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) { toast.error('เริ่มการเชื่อมไม่สำเร็จ'); return; }
      window.location.href = d.url as string;
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await fetch('/api/google-drive/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      // reset auto-remind + opt-in เสียง (PDPA: เชื่อมใหม่ต้อง opt-in เสียงใหม่)
      await fetch('/api/assistant/calendar', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ autoRemind: false, saveAudio: false }),
      });
      setConnected(false); setAutoRemind(false); setSaveAudio(false);
      toast.success('ยกเลิกการเชื่อมแล้ว');
    } finally { setBusy(false); }
  };

  const toggleRemind = async (next: boolean) => {
    if (!token) return;
    setAutoRemind(next); // optimistic
    const res = await fetch('/api/assistant/calendar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ autoRemind: next }),
    });
    if (!res.ok) { setAutoRemind(!next); toast.error('บันทึกไม่สำเร็จ'); }
    else toast.success(next ? 'เปิดเตือนประชุมจากปฏิทินแล้ว' : 'ปิดเตือนประชุมจากปฏิทินแล้ว');
  };

  const toggleSaveMom = async (next: boolean) => {
    if (!token) return;
    setSaveMom(next); // optimistic
    const res = await fetch('/api/assistant/calendar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ saveMom: next }),
    });
    if (!res.ok) { setSaveMom(!next); toast.error('บันทึกไม่สำเร็จ'); }
    else toast.success(next ? 'เปิดเก็บ MoM ลง Drive แล้ว' : 'ปิดเก็บ MoM ลง Drive แล้ว');
  };

  const toggleSaveAudio = async (next: boolean) => {
    if (!token) return;
    setSaveAudio(next); // optimistic
    const res = await fetch('/api/assistant/calendar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ saveAudio: next }),
    });
    if (!res.ok) { setSaveAudio(!next); toast.error('บันทึกไม่สำเร็จ'); }
    else toast.success(next ? 'เปิดเก็บไฟล์เสียงลง Drive แล้ว' : 'ปิดเก็บไฟล์เสียงลง Drive แล้ว');
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* การเชื่อมต่อ Google (ปฏิทิน + Drive — เชื่อมครั้งเดียวได้ทั้งคู่) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-gray-100 p-2 text-gray-700"><Link2 className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium text-gray-900">เชื่อมต่อ Google</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              เชื่อมครั้งเดียวเพื่อใช้ทั้งการเตือนประชุมจากปฏิทิน และการเก็บไฟล์ลง Google Drive · เมื่อเชื่อมจะเปิดให้อัตโนมัติ (ปรับได้ด้านล่าง)
            </p>
            <div className="mt-3">
              {connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> เชื่อมแล้ว
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  ยังไม่เชื่อม
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            {connected ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={disconnect}>
                <Unlink className="mr-1.5 h-4 w-4" /> ยกเลิกการเชื่อม
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={connect}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />} เชื่อม Google
              </Button>
            )}
          </div>
        </div>
      </div>

      {connected && (
        <>
          {/* Section: ปฏิทินประชุม */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2 text-gray-700">
              <CalendarCheck className="h-4 w-4" />
              <h2 className="text-sm font-semibold">ปฏิทินประชุม</h2>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-gray-900">เตือน + ส่งบอทจากปฏิทินอัตโนมัติ</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  ดูปฏิทินของคุณ แล้วเตือนให้ยืนยันส่งบอทเข้าห้องก่อนประชุมเริ่ม 5 นาที (ต้องกดยืนยันทุกครั้ง) ·
                  การเปิดถือว่าคุณยอมรับเงื่อนไขด้านล่างและรับผิดชอบการขอความยินยอมจากผู้เข้าร่วม
                </p>
              </div>
              <Switch checked={autoRemind} onChange={toggleRemind} aria-label="เตือนและส่งบอทจากปฏิทิน" />
            </div>
          </div>

          {/* Section: ที่เก็บไฟล์ (Google Drive) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2 text-gray-700">
              <HardDrive className="h-4 w-4" />
              <h2 className="text-sm font-semibold">ที่เก็บไฟล์ (Google Drive)</h2>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="flex items-center justify-between gap-4 pb-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">เก็บรายงานการประชุม (MoM)</h3>
                  <p className="mt-0.5 text-sm text-gray-500">
                    เมื่อสรุปประชุมเสร็จ ระบบจะเก็บ PDF สำเนาไว้ในโฟลเดอร์ “Perpos Assistant/รายงานการประชุม”
                    (ระบบลบในเซิร์ฟเวอร์ภายใน 48 ชม. แต่สำเนาบน Drive เป็นของคุณถาวร)
                  </p>
                </div>
                <Switch checked={saveMom} onChange={toggleSaveMom} aria-label="เก็บ MoM ลง Google Drive" />
              </div>
              <div className="flex items-center justify-between gap-4 pt-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">เก็บไฟล์เสียงต้นฉบับ</h3>
                  <p className="mt-0.5 text-sm text-gray-500">
                    เก็บไฟล์เสียงของการประชุมไว้บน Drive ด้วย (โฟลเดอร์ “Perpos Assistant/ไฟล์เสียง”)
                  </p>
                  <p className="mt-1 text-xs text-red-600">
                    ⚠️ ไฟล์เสียงมีเสียงของผู้เข้าร่วมคนอื่น — เปิดเฉพาะเมื่อได้รับความยินยอมและคุณรับผิดชอบการเก็บรักษาตาม PDPA
                  </p>
                </div>
                <Switch checked={saveAudio} onChange={toggleSaveAudio} aria-label="เก็บไฟล์เสียงลง Google Drive" />
              </div>
            </div>
          </div>
        </>
      )}

      {/* PDPA / onboarding note */}
      <p className="px-1 text-xs leading-relaxed text-gray-400">
        🔒 ผู้ช่วยขอสิทธิ์อ่าน/เขียนปฏิทิน (เพื่อบันทึกนัด+ส่งบอท) และเก็บไฟล์เฉพาะที่แอปสร้างใน Drive ของคุณเท่านั้น ไม่แก้ไข/ลบรายการอื่น ·
        บอทจะปรากฏในห้องชื่อ “PERPOS Assistant (AI Note-taker)” ให้ผู้เข้าร่วมเห็นว่ากำลังบันทึก ·
        ผู้ส่ง/เจ้าของนัดรับผิดชอบการขอความยินยอมจากผู้เข้าร่วมตาม PDPA
      </p>
    </div>
  );
}
