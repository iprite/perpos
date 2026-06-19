'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { PLAN_LABELS, PLAN_COLORS, type PlanTier, type PlanLimits } from '@/lib/billing';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge, type BadgeTone } from '@/components/ui/badge';
import { CreditCard, CheckCircle, AlertTriangle, XCircle, Clock, Wrench } from 'lucide-react';

const INVOICE_TONE: Record<string, BadgeTone> = {
  paid: 'success', open: 'info', draft: 'neutral', uncollectible: 'danger', void: 'neutral',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface BillingInfo {
  org_id:               string;
  org_name:             string;
  maintenance_mode:     boolean;
  plan_tier:            PlanTier;
  effective_limits:     PlanLimits;
  is_expired:           boolean;
  trial_days_remaining: number | null;
  trial_ends_at:        string | null;
  plan_starts_at:       string | null;
  plan_ends_at:         string | null;
  monthly_price:        number | null;
  currency:             string;
  payment_status:       string;
  has_stripe_customer:  boolean;
  has_stripe_subscription: boolean;
  notes:                string | null;
  updated_at:           string | null;
}

interface StripeInvoiceRow {
  id: string;
  number: string | null;
  status: string | null;
  currency: string | null;
  amount_due: number | null;
  amount_paid: number | null;
  amount_remaining: number | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  created_at: string | null;
}

interface StripeBillingInfo {
  connected: boolean;
  customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  price_id: string | null;
  updated_at: string | null;
  invoices: StripeInvoiceRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  trial:     { label: 'ทดลองใช้ฟรี', icon: <Clock         className="w-4 h-4" />, cls: 'text-blue-600 bg-blue-50 border-blue-200' },
  active:    { label: 'ชำระแล้ว',   icon: <CheckCircle  className="w-4 h-4" />, cls: 'text-green-600 bg-green-50 border-green-200' },
  overdue:   { label: 'ค้างชำระ',   icon: <AlertTriangle className="w-4 h-4" />, cls: 'text-red-600 bg-red-50 border-red-200' },
  pending:   { label: 'รอชำระ',     icon: <Clock         className="w-4 h-4" />, cls: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  cancelled: { label: 'ยกเลิกแล้ว', icon: <XCircle       className="w-4 h-4" />, cls: 'text-gray-500 bg-gray-50 border-gray-200' },
};

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtLimit(v: number | null) {
  if (v === null) return 'ไม่จำกัด';
  return v.toLocaleString();
}

function fmtPrice(price: number | null, currency: string) {
  if (price === null) return '—';
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency }).format(price);
}

function fmtMoneyMinor(amountMinor: number | null, currency: string | null) {
  if (amountMinor === null || !currency) return '—';
  const major = amountMinor / 100;
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: currency.toUpperCase() }).format(major);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [info, setInfo]       = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [token, setToken]     = useState('');
  const [orgId, setOrgId]     = useState('');
  const [actionErr, setActionErr] = useState('');
  const [paying, setPaying]   = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [stripeInfo, setStripeInfo] = useState<StripeBillingInfo | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeErr, setStripeErr] = useState('');

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const t = session?.access_token ?? '';
      setToken(t);

      // get active org from cookie
      const match = document.cookie.match(/perpos\.activeOrgId=([^;]+)/);
      const o = match ? decodeURIComponent(match[1]) : null;
      if (!o) { setError('ไม่พบ org ที่เปิดใช้งาน'); setLoading(false); return; }
      setOrgId(o);

      try {
        const res = await fetch(`/api/org/billing?orgId=${o}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        const d = await res.json() as BillingInfo & { error?: string };
        if (!res.ok) { setError(d.error ?? 'เกิดข้อผิดพลาด'); return; }
        setInfo(d);
      } catch { setError('Network error'); }
      finally  { setLoading(false); }
    })();
  }, [supabase]);

  useEffect(() => {
    if (!token || !orgId) return;
    if (!info?.monthly_price) return;

    setStripeLoading(true);
    setStripeErr('');
    void (async () => {
      try {
        const res = await fetch(`/api/org/billing/stripe?orgId=${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json() as StripeBillingInfo & { error?: string };
        if (!res.ok) { setStripeErr(d.error ?? 'เกิดข้อผิดพลาด'); return; }
        setStripeInfo(d);
      } catch {
        setStripeErr('Network error');
      } finally {
        setStripeLoading(false);
      }
    })();
  }, [token, orgId, info?.monthly_price]);

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">กำลังโหลด…</div>;
  if (error)   return <div className="p-8 text-center text-red-500 text-sm">{error}</div>;
  if (!info)   return null;

  const planCls  = PLAN_COLORS[info.plan_tier] ?? 'bg-gray-100 text-gray-600';
  const statusCfg = PAYMENT_STATUS_CONFIG[info.payment_status] ?? PAYMENT_STATUS_CONFIG.active;

  async function startCheckout() {
    setActionErr('');
    setPaying(true);
    try {
      const res = await fetch('/api/org/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      const d = await res.json() as { url?: string; error?: string };
      if (!res.ok || !d.url) { const m = d.error ?? 'เกิดข้อผิดพลาด'; setActionErr(m); toast.error(m); return; }
      window.location.href = d.url;
    } catch {
      setActionErr('Network error');
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setPaying(false);
    }
  }

  async function openPortal() {
    setActionErr('');
    setOpeningPortal(true);
    try {
      const res = await fetch('/api/org/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      const d = await res.json() as { url?: string; error?: string };
      if (!res.ok || !d.url) { const m = d.error ?? 'เกิดข้อผิดพลาด'; setActionErr(m); toast.error(m); return; }
      window.location.href = d.url;
    } catch {
      setActionErr('Network error');
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-gray-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Billing & Plan</h1>
            <p className="text-sm text-gray-500 mt-0.5">{info.org_name}</p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">สถานะการชำระ</div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${statusCfg.cls}`}>
            {statusCfg.icon}{statusCfg.label}
          </span>
        </div>
      </div>

      {/* Maintenance banner */}
      {info.maintenance_mode && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          <Wrench className="w-4 h-4 flex-shrink-0" />
          ระบบอยู่ในโหมดปิดปรับปรุงชั่วคราว
        </div>
      )}

      {/* Expired / trial warning */}
      {info.is_expired && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Plan หมดอายุแล้ว — กรุณาติดต่อทีมงาน PERPOS เพื่อต่ออายุ
        </div>
      )}
      {!info.is_expired && info.trial_days_remaining !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          <Clock className="w-4 h-4 flex-shrink-0" />
          Trial — เหลืออีก {info.trial_days_remaining} วัน (ถึง {fmtDate(info.trial_ends_at)})
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 mb-1">แพ็กเกจปัจจุบัน</div>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold border ${planCls}`}>
                {PLAN_LABELS[info.plan_tier]}
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">ราคา/เดือน</div>
              <div className="text-lg font-bold text-gray-900">
                {fmtPrice(info.monthly_price, info.currency)}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">วันที่เริ่มต้น</div>
              <div className="text-sm text-gray-900 font-medium mt-0.5">{fmtDate(info.plan_starts_at)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">วันหมดอายุ</div>
              <div className={`text-sm font-medium mt-0.5 ${info.is_expired ? 'text-red-600' : 'text-gray-900'}`}>
                {fmtDate(info.plan_ends_at)}
              </div>
            </div>

            {info.notes && (
              <div className="col-span-2">
                <div className="text-xs text-gray-500">หมายเหตุ</div>
                <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{info.notes}</div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="text-sm font-semibold text-gray-700">การชำระเงิน</div>
            <div className="text-xs text-gray-500 mt-0.5">ตั้งค่าครั้งแรกเพื่อให้ตัดบัตรอัตโนมัติทุกเดือน</div>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {!info.has_stripe_subscription && (
                <Button onClick={() => void startCheckout()} disabled={paying || !orgId || !token || info.monthly_price === null}>
                  {paying ? 'กำลังเปิดหน้า Stripe…' : 'เริ่มชำระเงิน'}
                </Button>
              )}
              {info.has_stripe_customer && (
                <Button variant="outline" onClick={() => void openPortal()} disabled={openingPortal || !orgId || !token}>
                  {openingPortal ? 'กำลังเปิด Portal…' : 'จัดการบัตร/ใบเสร็จ'}
                </Button>
              )}
            </div>

            {info.monthly_price === null && (
              <div className="text-sm text-gray-500">ยังไม่ระบุราคา กรุณาติดต่อทีมงาน PERPOS</div>
            )}

            {actionErr && (
              <div className="text-sm text-red-600">{actionErr}</div>
            )}

            {info.has_stripe_subscription && (
              <div className="text-xs text-gray-400">
                การยกเลิกแพ็กเกจต้องติดต่อทีมงาน PERPOS
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-700">รายการชำระเงิน (Stripe)</div>
              <div className="text-xs text-gray-500 mt-0.5">แสดงรายการใบแจ้งหนี้ล่าสุด (สูงสุด 10 รายการ)</div>
            </div>
            {stripeInfo?.subscription_status && (
              <div className="text-right">
                <div className="text-xs text-gray-500">สถานะ Subscription</div>
                <div className="text-sm font-semibold text-gray-900 mt-0.5">{stripeInfo.subscription_status}</div>
              </div>
            )}
          </div>
          <div className="px-6 py-4 space-y-4">
            {stripeLoading && (
              <div className="text-sm text-gray-400">กำลังโหลดรายการ…</div>
            )}
            {!stripeLoading && stripeErr && (
              <div className="text-sm text-red-600">{stripeErr}</div>
            )}
            {!stripeLoading && !stripeErr && stripeInfo && (
              <>
                <div className="grid gap-3 sm:grid-cols-3 text-sm">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">รอบถัดไป</div>
                    <div className="text-sm font-semibold text-gray-900 mt-0.5">{fmtDate(stripeInfo.current_period_end)}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">ตัดรอบล่าสุด</div>
                    <div className="text-sm font-semibold text-gray-900 mt-0.5">{fmtDate(stripeInfo.current_period_start)}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">การยกเลิก</div>
                    <div className="text-sm font-semibold text-gray-900 mt-0.5">{stripeInfo.cancel_at_period_end ? 'ยกเลิกสิ้นรอบ' : 'ปกติ'}</div>
                  </div>
                </div>

                {stripeInfo.invoices.length === 0 ? (
                  <div className="text-sm text-gray-500">ยังไม่มีรายการชำระเงิน</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>วันที่</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead align="right">ยอด</TableHead>
                        <TableHead align="right">เอกสาร</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stripeInfo.invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>{fmtDate(inv.created_at)}</TableCell>
                          <TableCell>{inv.status ? <StatusBadge tone={INVOICE_TONE[inv.status] ?? 'neutral'}>{inv.status}</StatusBadge> : '—'}</TableCell>
                          <TableCell align="right" tabular>{fmtMoneyMinor(inv.amount_paid ?? inv.amount_due, inv.currency)}</TableCell>
                          <TableCell align="right">
                            <div className="inline-flex items-center gap-1">
                              {inv.hosted_invoice_url ? (
                                <Button asChild variant="ghost" size="sm">
                                  <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">
                                    เปิด
                                  </a>
                                </Button>
                              ) : null}
                              {inv.invoice_pdf ? (
                                <Button asChild variant="ghost" size="sm">
                                  <a href={inv.invoice_pdf} target="_blank" rel="noreferrer">
                                    PDF
                                  </a>
                                </Button>
                              ) : null}
                              {!inv.hosted_invoice_url && !inv.invoice_pdf ? '—' : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                <div className="text-xs text-gray-400">
                  ดูรายละเอียด/เปลี่ยนบัตรได้ที่ปุ่ม “จัดการบัตร/ใบเสร็จ”
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Limits */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
          ขีดจำกัดการใช้งาน
        </div>
        <div className="divide-y divide-gray-100">
          {[
            { label: 'ผู้ใช้งาน',           value: fmtLimit(info.effective_limits.maxUsers) },
            { label: 'API requests/วัน',     value: fmtLimit(info.effective_limits.maxApiRequestsPerDay) },
            { label: 'Webhooks',             value: fmtLimit(info.effective_limits.maxWebhooks) },
            { label: 'Custom fields',        value: fmtLimit(info.effective_limits.maxCustomFields) },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-6 py-3">
              <span className="text-sm text-gray-600">{label}</span>
              <span className="text-sm font-medium text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        ต้องการเปลี่ยน plan หรือมีคำถามเรื่องการชำระเงิน กรุณาติดต่อทีมงาน PERPOS
      </p>
    </div>
  );
}
