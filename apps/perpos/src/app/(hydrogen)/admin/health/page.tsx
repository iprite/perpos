'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button }       from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  RefreshCw, ChevronDown, ChevronRight,
  Wifi, WebhookIcon, Clock, CreditCard, Wrench,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type FactorStatus = 'ok' | 'warning' | 'critical';
type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

interface Factor {
  deduction:  number;
  status:     FactorStatus;
  [key: string]: unknown;
}

interface OrgHealth {
  org_id:           string;
  org_name:         string;
  maintenance_mode: boolean;
  health_score:     number;
  grade:            Grade;
  factors: {
    api:      Factor & { request_count: number; error_count: number; error_rate_pct: number };
    webhooks: Factor & { delivery_count: number; failure_count: number; failure_rate_pct: number };
    activity: Factor & { last_seen_at: string | null; days_since: number | null };
    billing:  Factor & { plan_tier: string; is_expired: boolean; trial_days_remaining: number | null };
  };
  computed_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = Object.entries(localStorage).find(([k]) => k.includes('supabase') && k.includes('auth'));
    if (!raw) return '';
    return JSON.parse(raw[1])?.access_token ?? '';
  } catch { return ''; }
}

const GRADE_COLOR: Record<Grade, string> = {
  A: 'bg-green-100  text-green-700  border-green-200',
  B: 'bg-blue-100   text-blue-700   border-blue-200',
  C: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  D: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-red-100    text-red-700    border-red-200',
};

const SCORE_BAR: Record<Grade, string> = {
  A: 'bg-green-500',
  B: 'bg-blue-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  F: 'bg-red-500',
};

const STATUS_DOT: Record<FactorStatus, string> = {
  ok:       'bg-green-500',
  warning:  'bg-yellow-400',
  critical: 'bg-red-500',
};

function fmtDate(s: string | null) {
  if (!s) return 'ไม่มีข้อมูล';
  return new Date(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

// ── Score circle ─────────────────────────────────────────────────────────────

function ScoreCircle({ score, grade }: { score: number; grade: Grade }) {
  const r   = 26;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-gray-200" />
        <circle
          cx="32" cy="32" r={r} fill="none" strokeWidth="6"
          className={SCORE_BAR[grade].replace('bg-', 'stroke-')}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-gray-900 leading-none">{score}</span>
        <span className={`text-xs font-bold ${GRADE_COLOR[grade].split(' ')[1]}`}>{grade}</span>
      </div>
    </div>
  );
}

// ── Factor row ────────────────────────────────────────────────────────────────

function FactorRow({
  icon, label, status, detail, deduction,
}: {
  icon:      React.ReactNode;
  label:     string;
  status:    FactorStatus;
  detail:    string;
  deduction: number;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
      <div className="flex-shrink-0 text-gray-400">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5 truncate">{detail}</div>
      </div>
      {deduction > 0 && (
        <span className="text-xs font-medium text-red-500 flex-shrink-0">−{deduction}</span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { value: 'all',      label: 'ทุก org' },
  { value: 'critical', label: 'เฉพาะ Critical (F/D)' },
  { value: 'warning',  label: 'เฉพาะ Warning (C)' },
  { value: 'healthy',  label: 'เฉพาะ Healthy (A/B)' },
];

export default function HealthPage() {
  const [orgs,     setOrgs]     = useState<OrgHealth[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter,   setFilter]   = useState('all');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/health', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await res.json() as { orgs?: OrgHealth[]; error?: string };
      if (!res.ok) { setError(d.error ?? 'Error'); return; }
      setOrgs(d.orgs ?? []);
      setLastRefresh(new Date());
    } catch { setError('Network error'); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filtered = orgs.filter((o) => {
    if (filter === 'critical') return ['F', 'D'].includes(o.grade);
    if (filter === 'warning')  return o.grade === 'C';
    if (filter === 'healthy')  return ['A', 'B'].includes(o.grade);
    return true;
  });

  const counts = {
    A: orgs.filter((o) => o.grade === 'A').length,
    B: orgs.filter((o) => o.grade === 'B').length,
    C: orgs.filter((o) => o.grade === 'C').length,
    D: orgs.filter((o) => o.grade === 'D').length,
    F: orgs.filter((o) => o.grade === 'F').length,
  };
  const avgScore = orgs.length > 0
    ? Math.round(orgs.reduce((s, o) => s + o.health_score, 0) / orgs.length)
    : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Health</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            คะแนนสุขภาพของแต่ละ org
            {lastRefresh && (
              <span className="ml-2 text-gray-400">
                อัปเดตล่าสุด {lastRefresh.toLocaleTimeString('th-TH')}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          รีเฟรช
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-6 gap-3">
        <div className="col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center gap-3">
          <div>
            <div className="text-3xl font-bold text-gray-900">{avgScore}</div>
            <div className="text-xs text-gray-500">คะแนนเฉลี่ย</div>
          </div>
        </div>
        {(['A', 'B', 'C', 'D', 'F'] as Grade[]).map((g) => (
          <div key={g} className={`rounded-xl border p-3 text-center ${GRADE_COLOR[g]}`}>
            <div className="text-xl font-bold">{counts[g]}</div>
            <div className="text-xs font-medium">Grade {g}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <CustomSelect
          value={filter}
          onChange={setFilter}
          options={FILTER_OPTIONS}
          className="w-52"
        />
        <span className="text-sm text-gray-400">
          แสดง {filtered.length} จาก {orgs.length} orgs
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>
      )}

      {/* Org cards */}
      {loading && !orgs.length ? (
        <div className="py-16 text-center text-gray-400 text-sm">กำลังโหลด…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-gray-400 text-sm">
          ไม่พบ org ที่ตรงกับตัวกรอง
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const isOpen = expanded.has(o.org_id);
            return (
              <div key={o.org_id} className={`rounded-xl border overflow-hidden transition-shadow ${
                o.grade === 'F' ? 'border-red-200' :
                o.grade === 'D' ? 'border-orange-200' :
                o.grade === 'C' ? 'border-yellow-200' : 'border-gray-200'
              }`}>
                {/* Summary row */}
                <button
                  onClick={() => toggleExpand(o.org_id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 text-left"
                >
                  <ScoreCircle score={o.health_score} grade={o.grade} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{o.org_name}</span>
                      {o.maintenance_mode && (
                        <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-600 rounded-full px-2 py-0.5">
                          <Wrench className="w-3 h-3" />Maintenance
                        </span>
                      )}
                    </div>
                    {/* Factor status dots */}
                    <div className="flex items-center gap-3 mt-1.5">
                      {([
                        ['API',       o.factors.api.status],
                        ['Webhooks',  o.factors.webhooks.status],
                        ['Activity',  o.factors.activity.status],
                        ['Billing',   o.factors.billing.status],
                      ] as [string, FactorStatus][]).map(([name, s]) => (
                        <span key={name} className="flex items-center gap-1 text-xs text-gray-500">
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />{name}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isOpen
                    ? <ChevronDown  className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {/* Factor detail */}
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-0">
                    <FactorRow
                      icon={<Wifi className="w-3.5 h-3.5" />}
                      label="API Health (24h)"
                      status={o.factors.api.status}
                      detail={`${o.factors.api.request_count.toLocaleString()} requests — ${o.factors.api.error_rate_pct}% error rate (${o.factors.api.error_count} errors)`}
                      deduction={o.factors.api.deduction}
                    />
                    <FactorRow
                      icon={<WebhookIcon className="w-3.5 h-3.5" />}
                      label="Webhook Deliveries (7d)"
                      status={o.factors.webhooks.status}
                      detail={`${o.factors.webhooks.delivery_count} deliveries — ${o.factors.webhooks.failure_rate_pct}% failure rate (${o.factors.webhooks.failure_count} failed)`}
                      deduction={o.factors.webhooks.deduction}
                    />
                    <FactorRow
                      icon={<Clock className="w-3.5 h-3.5" />}
                      label="Last Activity"
                      status={o.factors.activity.status}
                      detail={
                        o.factors.activity.last_seen_at
                          ? `${fmtDate(o.factors.activity.last_seen_at)} (${o.factors.activity.days_since ?? 0} วันที่แล้ว)`
                          : 'ไม่มีกิจกรรมใน 24 ชั่วโมงที่ผ่านมา'
                      }
                      deduction={o.factors.activity.deduction}
                    />
                    <FactorRow
                      icon={<CreditCard className="w-3.5 h-3.5" />}
                      label="Billing"
                      status={o.factors.billing.status}
                      detail={
                        o.factors.billing.is_expired
                          ? `Plan หมดอายุแล้ว (${o.factors.billing.plan_tier})`
                          : o.factors.billing.trial_days_remaining !== null
                          ? `Trial — เหลือ ${o.factors.billing.trial_days_remaining} วัน (${o.factors.billing.plan_tier})`
                          : `Plan: ${o.factors.billing.plan_tier} — ปกติ`
                      }
                      deduction={o.factors.billing.deduction}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
