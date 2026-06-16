'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { Loader2, CheckCircle2 } from 'lucide-react';

const SHADOW_DOMAIN = '@stt-line.perpos.io';

export default function ClaimAccountPage() {
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) { setLoading(false); return; }
      setSignedIn(true);
      setClaimed(!String(user.email ?? '').endsWith(SHADOW_DOMAIN));
      setLoading(false);
    })();
  }, [supabase]);

  const handleClaim = async () => {
    if (password !== confirm) { toast.error('รหัสผ่านไม่ตรงกัน'); return; }
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch('/api/account/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error?.message ?? 'บันทึกไม่สำเร็จ');
      }
      setDone(true);
      toast.success('เคลมบัญชีสำเร็จ!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        {!signedIn ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-900">ลิงก์หมดอายุหรือไม่ถูกต้อง</h1>
            <p className="mt-2 text-sm text-gray-500">กรุณาพิมพ์ <code>/web</code> ในแชท LINE เพื่อรับลิงก์ใหม่</p>
          </div>
        ) : done || claimed ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500" />
            <h1 className="text-lg font-semibold text-gray-900">บัญชีพร้อมใช้งานแล้ว</h1>
            <p className="mt-2 text-sm text-gray-500">เข้าสู่ระบบเรียบร้อย ดูประวัติและดาวน์โหลดรายงานได้เลย</p>
            <Link href="/"><Button className="mt-4 w-full">ไปหน้าหลัก</Button></Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900">ตั้งค่าบัญชีถาวร (ไม่บังคับ)</h1>
            <p className="mt-1 text-sm text-gray-500">ตั้ง email และรหัสผ่าน เพื่อเข้าเว็บได้โดยไม่ต้องผ่าน LINE — หรือใช้ปุ่ม “เข้าสู่ระบบด้วย LINE” ต่อไปก็ได้</p>
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="email">อีเมล *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pw">รหัสผ่าน * (อย่างน้อย 8 ตัว)</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pw2">ยืนยันรหัสผ่าน *</Label>
                <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1" />
              </div>
              <Button className="w-full" disabled={saving || !email || password.length < 8} onClick={handleClaim}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังบันทึก…</> : 'ยืนยันเป็นเจ้าของบัญชี'}
              </Button>
              <Link href="/" className="block text-center text-sm text-gray-500 hover:text-gray-700">
                ข้ามไปก่อน — ไปหน้าหลัก
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
