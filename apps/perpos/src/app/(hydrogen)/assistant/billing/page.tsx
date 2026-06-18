'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Check, Clock, Sparkles, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Plan = {
  id: string;
  code: string;
  name: string;
  kind: 'subscription' | 'topup';
  meter: 'stt' | 'bot';
  minutes: number;
  price: number;
  currency: string;
};
type Sub = { plan_id: string | null; status: string | null; current_period_end: string | null; cancel_at_period_end: boolean };

const thb = (n: number) => new Intl.NumberFormat('th-TH').format(n);
const ACTIVE_SUB = ['trialing', 'active', 'past_due'];

export default function TranscribeBillingPage() {
  const search = useSearchParams();
  const supabase = createSupabaseBrowserClient();

  const [token, setToken] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);
  const [quota, setQuota] = useState<{ limit: number; used: number } | null>(null);
  const [botQuota, setBotQuota] = useState<{ limit: number; used: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token ?? '';
      setToken(accessToken);

      const [{ data: planRows }, { data: subRow }, quotaRes] = await Promise.all([
        supabase.from('stt_plans').select('id, code, name, kind, meter, minutes, price, currency').eq('is_active', true).order('sort_order'),
        supabase.from('stt_subscriptions').select('plan_id, status, current_period_end, cancel_at_period_end').maybeSingle(),
        accessToken ? fetch(`/api/assistant/quota`, { headers: { Authorization: `Bearer ${accessToken}` } }) : Promise.resolve(null),
      ]);
      setPlans((planRows ?? []).map((p) => ({ ...p, price: Number(p.price) })) as Plan[]);
      setSub((subRow as Sub) ?? null);
      if (quotaRes && quotaRes.ok) {
        const d = (await quotaRes.json()).data;
        setQuota({ limit: d.limit_seconds, used: d.used_seconds });
        if (d.bot) setBotQuota({ limit: d.bot.limit_seconds, used: d.bot.used_seconds });
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (search.get('billing') === 'success') toast.success('ชำระเงินสำเร็จ — โควต้าจะอัปเดตภายในไม่กี่วินาที');
    if (search.get('billing') === 'canceled') toast('ยกเลิกการชำระเงิน', { icon: 'ℹ️' });
  }, [search]);

  const [portalLoading, setPortalLoading] = useState(false);
  const openPortal = async () => {
    if (!token) return;
    setPortalLoading(true);
    try {
      const res = await fetch('/api/assistant/stt/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) { toast.error('เปิดหน้าจัดการไม่สำเร็จ'); return; }
      window.location.href = data.url as string;
    } finally {
      setPortalLoading(false);
    }
  };

  const buy = async (planCode: string) => {
    if (!token) return;
    setBuying(planCode);
    try {
      const res = await fetch('/api/assistant/stt/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        toast.error(data.error === 'already_subscribed' ? 'คุณมีแพ็กเกจรายเดือนอยู่แล้ว' : 'เริ่มชำระเงินไม่สำเร็จ');
        return;
      }
      window.location.href = data.url as string;
    } finally {
      setBuying('');
    }
  };

  const subscriptions = plans.filter((p) => p.kind === 'subscription' && p.meter !== 'bot');
  const topups = plans.filter((p) => p.kind === 'topup' && p.meter !== 'bot');
  const botTopups = plans.filter((p) => p.meter === 'bot');
  const hasActiveSub = !!sub && !!sub.status && ACTIVE_SUB.includes(sub.status);
  const remainMin = quota ? Math.max(0, Math.floor((quota.limit - quota.used) / 60)) : null;
  const botRemainMin = botQuota ? Math.max(0, Math.floor((botQuota.limit - botQuota.used) / 60)) : null;

  return (
    <>
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left — สถานะ/โควต้า */}
          <div className="lg:col-span-4 xl:col-span-3">
            <div className="space-y-4 lg:sticky lg:top-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-gray-500"><Clock className="h-4 w-4" /> โควต้าคงเหลือ</div>
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="text-xs text-gray-400">🎙️ ถอดเสียง (อัปไฟล์เอง)</div>
                    <div className="text-2xl font-bold tabular-nums text-gray-900">{remainMin != null ? thb(remainMin) : '—'}<span className="ml-1 text-sm font-medium text-gray-400">นาที</span></div>
                  </div>
                  <div className="border-t border-gray-100 pt-2">
                    <div className="text-xs text-gray-400">🤖 บอทเข้าประชุม</div>
                    <div className="text-2xl font-bold tabular-nums text-gray-900">{botRemainMin != null ? thb(botRemainMin) : '—'}<span className="ml-1 text-sm font-medium text-gray-400">นาที</span></div>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${hasActiveSub ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-gray-900">{hasActiveSub ? 'แพ็กเกจทำงานอยู่' : 'ยังไม่มีแพ็กเกจ'}</span>
                  </div>
                  {hasActiveSub ? (
                    <p className="mt-2 text-xs text-gray-500">
                      {sub?.current_period_end ? `ต่ออายุ ${new Date(sub.current_period_end).toLocaleDateString('th-TH')}` : ''}
                      {sub?.cancel_at_period_end ? ' · จะยกเลิกเมื่อสิ้นรอบ' : ''}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">สมัครแพ็กเกจรายเดือนเพื่อรับนาทีถอดเสียง</p>
                  )}
                </div>
                {hasActiveSub ? (
                  <Button variant="outline" size="sm" className="mt-3 w-full" onClick={openPortal} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} จัดการการเรียกเก็บเงิน
                  </Button>
                ) : null}
              </div>

              <p className="flex items-start gap-1.5 px-1 text-xs text-gray-400">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" /> ชำระผ่าน Stripe ปลอดภัย · เราไม่นำข้อมูลเสียงไปฝึกโมเดล AI
              </p>
            </div>
          </div>

          {/* Right — แพ็กเกจ */}
          <div className="lg:col-span-8 xl:col-span-9">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-gray-900">แพ็กเกจรายเดือน</h2>
            </div>
            <p className="mb-4 text-sm text-gray-500">ตัดบัตรอัตโนมัติทุก 30 วัน · นาทีรีเซ็ตทุกรอบ (ใช้ไม่หมดไม่สะสม) · ยกเลิกได้ทุกเมื่อ ไม่มีคืนเงิน</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {subscriptions.map((p, i) => (
                <div key={p.id} className={`relative rounded-2xl border bg-white p-6 shadow-sm ${i === 0 ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-gray-100'}`}>
                  {i === 0 ? <div className="absolute right-4 top-4 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">แนะนำ</div> : null}
                  <div className="text-base font-medium text-gray-900">{p.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tabular-nums text-gray-900">฿{thb(p.price)}</span>
                    <span className="text-sm text-gray-500">/เดือน</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-600">
                    <Clock className="h-4 w-4 text-indigo-500" /> {thb(p.minutes)} นาที/เดือน
                  </div>
                  <Button className="mt-5 w-full" disabled={!!buying || hasActiveSub} onClick={() => buy(p.code)}>
                    {buying === p.code ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {hasActiveSub ? 'มีแพ็กเกจอยู่แล้ว' : 'สมัคร'}
                  </Button>
                </div>
              ))}
            </div>

            {/* Top-ups — แสดงเฉพาะเมื่อมีแพ็ก topup ที่เปิดขาย (ปัจจุบันปิด) */}
            {topups.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-1 text-lg font-semibold text-gray-900">เติมนาที (จ่ายครั้งเดียว)</h2>
                <p className="mb-3 text-sm text-gray-500">นาทีที่เติมไม่หมดอายุ สะสมข้ามรอบได้</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {topups.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                      <div>
                        <div className="text-base font-medium text-gray-900">{thb(p.minutes)} นาที</div>
                        <div className="text-sm text-gray-500">฿{thb(p.price)}</div>
                      </div>
                      <Button variant="outline" disabled={!!buying} onClick={() => buy(p.code)}>
                        {buying === p.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" /> เติม</>}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* แพ็กบอทประชุม (เติมนาที bot) */}
            {botTopups.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-1 text-lg font-semibold text-gray-900">🤖 แพ็กบอทเข้าประชุม</h2>
                <p className="mb-3 text-sm text-gray-500">เติมนาทีให้บอท Recall เข้าห้องอัด + สรุป MoM · นาทีไม่หมดอายุ สะสมได้</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {botTopups.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                      <div>
                        <div className="text-base font-medium text-gray-900">{thb(p.minutes)} นาที</div>
                        <div className="text-sm text-gray-500">฿{thb(p.price)}</div>
                      </div>
                      <Button variant="outline" disabled={!!buying} onClick={() => buy(p.code)}>
                        {buying === p.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" /> เติม</>}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
