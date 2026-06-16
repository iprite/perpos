'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Check, Clock, Sparkles, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Plan = {
  id: string;
  code: string;
  name: string;
  kind: 'subscription' | 'topup';
  minutes: number;
  price: number;
  currency: string;
};
type Sub = { plan_id: string | null; status: string | null; current_period_end: string | null; cancel_at_period_end: boolean };

const thb = (n: number) => new Intl.NumberFormat('th-TH').format(n);
const ACTIVE_SUB = ['trialing', 'active', 'past_due'];

export default function TranscribeBillingPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const search = useSearchParams();
  const supabase = createSupabaseBrowserClient();

  const [orgId, setOrgId] = useState('');
  const [token, setToken] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);
  const [quota, setQuota] = useState<{ limit: number; used: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
      const oid = org?.id ? String(org.id) : '';
      setOrgId(oid);
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token ?? '';
      setToken(accessToken);

      const [{ data: planRows }, { data: subRow }, quotaRes] = await Promise.all([
        supabase.from('stt_plans').select('id, code, name, kind, minutes, price, currency').eq('is_active', true).order('sort_order'),
        supabase.from('stt_subscriptions').select('plan_id, status, current_period_end, cancel_at_period_end').maybeSingle(),
        oid ? fetch(`/api/assistant/transcribe/quota?orgId=${oid}`, { headers: { Authorization: `Bearer ${accessToken}` } }) : Promise.resolve(null),
      ]);
      setPlans((planRows ?? []).map((p) => ({ ...p, price: Number(p.price) })) as Plan[]);
      setSub((subRow as Sub) ?? null);
      if (quotaRes && quotaRes.ok) {
        const d = (await quotaRes.json()).data;
        setQuota({ limit: d.limit_seconds, used: d.used_seconds });
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug]);
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
      const res = await fetch('/api/assistant/transcribe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgSlug }),
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
      const res = await fetch('/api/assistant/transcribe/checkout', {
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

  const subscriptions = plans.filter((p) => p.kind === 'subscription');
  const topups = plans.filter((p) => p.kind === 'topup');
  const hasActiveSub = !!sub && !!sub.status && ACTIVE_SUB.includes(sub.status);
  const remainMin = quota ? Math.max(0, Math.floor((quota.limit - quota.used) / 60)) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <Sparkles className="h-6 w-6 text-indigo-600" /> ซื้อนาทีแกะเสียง
        </h1>
        <div className="flex gap-2">
          <Link href={`/${orgSlug}/assistant/transcribe`}><Button variant="outline" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> กลับ</Button></Link>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-8">
          {/* โควต้าปัจจุบัน */}
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <div className="flex items-center gap-2 text-sm text-gray-500"><Clock className="h-4 w-4" /> โควต้าคงเหลือ</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{remainMin != null ? `${thb(remainMin)} นาที` : '—'}</div>
            {hasActiveSub ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-xs text-gray-500">
                  แพ็กเกจรายเดือนทำงานอยู่{sub?.current_period_end ? ` · ต่ออายุ ${new Date(sub.current_period_end).toLocaleDateString('th-TH')}` : ''}
                  {sub?.cancel_at_period_end ? ' · จะยกเลิกเมื่อสิ้นรอบ' : ''}
                </p>
                <Button variant="outline" size="sm" onClick={openPortal} disabled={portalLoading}>
                  {portalLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} จัดการการเรียกเก็บเงิน
                </Button>
              </div>
            ) : null}
          </div>

          {/* Subscriptions */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">แพ็กเกจรายเดือน</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {subscriptions.map((p, i) => (
                <div key={p.id} className={`rounded-2xl border bg-white p-6 shadow-sm ${i === 0 ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-gray-100'}`}>
                  {i === 0 ? <div className="mb-2 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">แนะนำ</div> : null}
                  <div className="text-base font-medium text-gray-900">{p.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tabular-nums text-gray-900">฿{thb(p.price)}</span>
                    <span className="text-sm text-gray-500">/เดือน</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">{thb(p.minutes)} นาที/เดือน</div>
                  <Button className="mt-4 w-full" disabled={!!buying || hasActiveSub} onClick={() => buy(p.code)}>
                    {buying === p.code ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {hasActiveSub ? 'มีแพ็กเกจอยู่แล้ว' : 'สมัคร'}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Top-ups */}
          <div>
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

          <p className="flex items-center gap-1.5 text-xs text-gray-400">
            <Check className="h-3.5 w-3.5 text-green-500" /> ชำระผ่าน Stripe ปลอดภัย · เราไม่นำข้อมูลเสียงไปฝึกโมเดล AI
          </p>
        </div>
      )}
    </div>
  );
}
