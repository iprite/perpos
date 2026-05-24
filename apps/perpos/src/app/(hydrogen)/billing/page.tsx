'use client';

import { useEffect, useState, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PLAN_LABELS, PLAN_COLORS, type PlanTier, type PlanLimits } from '@/lib/billing';
import { CreditCard, CheckCircle, AlertTriangle, XCircle, Clock, Wrench } from 'lucide-react';

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
  notes:                string | null;
  updated_at:           string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [info, setInfo]       = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';

      // get active org from cookie
      const match = document.cookie.match(/perpos\.activeOrgId=([^;]+)/);
      const orgId = match ? decodeURIComponent(match[1]) : null;
      if (!orgId) { setError('ไม่พบ org ที่เปิดใช้งาน'); setLoading(false); return; }

      try {
        const res = await fetch(`/api/org/billing?orgId=${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json() as BillingInfo & { error?: string };
        if (!res.ok) { setError(d.error ?? 'เกิดข้อผิดพลาด'); return; }
        setInfo(d);
      } catch { setError('Network error'); }
      finally  { setLoading(false); }
    })();
  }, [supabase]);

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">กำลังโหลด…</div>;
  if (error)   return <div className="p-8 text-center text-red-500 text-sm">{error}</div>;
  if (!info)   return null;

  const planCls  = PLAN_COLORS[info.plan_tier] ?? 'bg-gray-100 text-gray-600';
  const statusCfg = PAYMENT_STATUS_CONFIG[info.payment_status] ?? PAYMENT_STATUS_CONFIG.active;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CreditCard className="w-6 h-6 text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Plan</h1>
          <p className="text-sm text-gray-500 mt-0.5">{info.org_name}</p>
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

      {/* Plan card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 mb-1">แพ็กเกจปัจจุบัน</div>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold border ${planCls}`}>
              {PLAN_LABELS[info.plan_tier]}
            </span>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 mb-1">สถานะการชำระ</div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${statusCfg.cls}`}>
              {statusCfg.icon}{statusCfg.label}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">ราคา/เดือน</div>
            <div className="text-lg font-bold text-gray-900 mt-0.5">
              {fmtPrice(info.monthly_price, info.currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">วันที่เริ่มต้น</div>
            <div className="text-sm text-gray-800 mt-0.5">{fmtDate(info.plan_starts_at)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">วันหมดอายุ</div>
            <div className={`text-sm mt-0.5 ${info.is_expired ? 'text-red-600 font-semibold' : 'text-gray-800'}`}>
              {fmtDate(info.plan_ends_at)}
            </div>
          </div>
          {info.notes && (
            <div className="col-span-2">
              <div className="text-xs text-gray-500">หมายเหตุ</div>
              <div className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{info.notes}</div>
            </div>
          )}
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
