'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  RefreshCw, Users, Building2, Activity, Webhook,
  AlertTriangle, CheckCircle, TrendingUp, CreditCard,
  Wrench, Clock,
} from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PLAN_LABELS, PLAN_COLORS, type PlanTier } from '@/lib/billing';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  computed_at:   string;
  users:         { total: number; active: number; line_linked: number; super_admins: number };
  orgs:          { total: number; maintenance: number };
  billing:       { tier_counts: Record<string, number>; expired: number; overdue: number };
  api:           { requests_24h: number; errors_24h: number; error_rate_pct: number };
  webhooks:      { deliveries_7d: number; failed_7d: number; fail_rate_pct: number };
  health_grades: Record<string, number>;
  attention_orgs: { org_id: string; org_name: string; expired: boolean; overdue: boolean }[];
  recent_orgs:   { id: string; name: string; created_at: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADE_COLOR: Record<string, string> = {
  A: 'bg-green-100  text-green-700  border-green-200',
  B: 'bg-blue-100   text-blue-700   border-blue-200',
  C: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  D: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-red-100    text-red-700    border-red-200',
};

function fmtNum(n: number) { return n.toLocaleString(); }

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, accent,
}: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex items-start gap-4">
      <div className={`flex-shrink-0 rounded-lg p-2.5 ${accent ?? 'bg-gray-100 text-gray-600'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">{title}</div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json() as DashboardData & { error?: string };
      if (!res.ok) { setError(d.error ?? 'Error'); return; }
      setData(d);
    } catch { setError('Network error'); }
    finally  { setLoading(false); }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <div className="p-8 text-center text-gray-400 text-sm">กำลังโหลด…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-red-500 text-sm">{error}</div>;
  }
  if (!data) return null;

  const { users, orgs, billing, api, webhooks, health_grades, attention_orgs, recent_orgs } = data;

  const apiStatus  = api.error_rate_pct > 5 ? 'critical' : api.error_rate_pct > 1 ? 'warning' : 'ok';
  const hookStatus = webhooks.fail_rate_pct > 10 ? 'critical' : webhooks.fail_rate_pct > 3 ? 'warning' : 'ok';

  const statusColor = { ok: 'bg-green-100 text-green-600', warning: 'bg-yellow-100 text-yellow-600', critical: 'bg-red-100 text-red-600' } as const;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            อัปเดต {new Date(data.computed_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          รีเฟรช
        </Button>
      </div>

      {/* Attention banner */}
      {(billing.expired > 0 || billing.overdue > 0 || orgs.maintenance > 0) && (
        <div className="flex flex-wrap gap-3">
          {billing.expired > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {billing.expired} org plan หมดอายุ
            </div>
          )}
          {billing.overdue > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-700">
              <CreditCard className="w-4 h-4 flex-shrink-0" />
              {billing.overdue} org ค้างชำระ
            </div>
          )}
          {orgs.maintenance > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-sm text-yellow-700">
              <Wrench className="w-4 h-4 flex-shrink-0" />
              {orgs.maintenance} org อยู่ใน Maintenance Mode
            </div>
          )}
        </div>
      )}

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Building2 className="w-5 h-5" />} label="Orgs ทั้งหมด" value={fmtNum(orgs.total)} accent="bg-blue-50 text-blue-600" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Users ทั้งหมด" value={fmtNum(users.total)} sub={`${fmtNum(users.active)} active`} accent="bg-purple-50 text-purple-600" />
        <StatCard icon={<Activity className="w-5 h-5" />} label="API requests (24h)" value={fmtNum(api.requests_24h)} sub={`${api.error_rate_pct}% error rate`} accent={statusColor[apiStatus]} />
        <StatCard icon={<Webhook className="w-5 h-5" />} label="Webhooks (7d)" value={fmtNum(webhooks.deliveries_7d)} sub={`${webhooks.fail_rate_pct}% fail rate`} accent={statusColor[hookStatus]} />
      </div>

      {/* Mid row: Health grades + Billing tiers + Users breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Health grades */}
        <Section title="Tenant Health Grades">
          <div className="flex gap-2">
            {(['A','B','C','D','F']).map((g) => (
              <div key={g} className={`flex-1 rounded-lg border text-center py-2 ${GRADE_COLOR[g]}`}>
                <div className="text-xl font-bold">{health_grades[g] ?? 0}</div>
                <div className="text-xs font-semibold">{g}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-400 text-right">
            <Link href="/admin/health" className="hover:text-blue-600 underline-offset-2 hover:underline">ดูรายละเอียด →</Link>
          </div>
        </Section>

        {/* Billing tiers */}
        <Section title="Billing Tiers">
          <div className="space-y-2">
            {(['enterprise','pro','starter','free'] as PlanTier[]).map((tier) => {
              const count = billing.tier_counts[tier] ?? 0;
              const pct   = orgs.total > 0 ? Math.round((count / orgs.total) * 100) : 0;
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold w-20 text-center ${PLAN_COLORS[tier]}`}>{PLAN_LABELS[tier]}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full bg-blue-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-gray-400 text-right">
            <Link href="/admin/billing" className="hover:text-blue-600 underline-offset-2 hover:underline">จัดการ Billing →</Link>
          </div>
        </Section>

        {/* Users breakdown */}
        <Section title="Users">
          <div className="space-y-3">
            {[
              { label: 'Active',       value: users.active,      icon: <CheckCircle className="w-3.5 h-3.5 text-green-500" /> },
              { label: 'LINE Linked',  value: users.line_linked, icon: <TrendingUp   className="w-3.5 h-3.5 text-blue-500"  /> },
              { label: 'Super Admins', value: users.super_admins,icon: <Users        className="w-3.5 h-3.5 text-purple-500"/> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {icon}{label}
                </div>
                <span className="text-sm font-semibold text-gray-900">{fmtNum(value)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-400 text-right">
            <Link href="/admin/users" className="hover:text-blue-600 underline-offset-2 hover:underline">User Management →</Link>
          </div>
        </Section>
      </div>

      {/* Bottom row: Attention orgs + Recent orgs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Needs attention */}
        <Section title="ต้องดูแล">
          {attention_orgs.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" /> ทุก org ปกติดี
            </div>
          ) : (
            <div className="space-y-2">
              {attention_orgs.map((o) => (
                <div key={o.org_id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-800">{o.org_name}</span>
                  <div className="flex gap-1.5">
                    {o.expired && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">หมดอายุ</span>}
                    {o.overdue && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">ค้างชำระ</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Recent orgs */}
        <Section title="Org ใหม่ล่าสุด">
          {recent_orgs.length === 0 ? (
            <div className="text-sm text-gray-400">ยังไม่มี org</div>
          ) : (
            <div className="space-y-2">
              {recent_orgs.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-800">{o.name}</span>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />{fmtDate(o.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
