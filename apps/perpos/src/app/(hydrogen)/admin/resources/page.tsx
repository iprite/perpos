"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Title } from "@/components/ui/typography";
import { AlertTriangle, TrendingUp, Clock, Zap, Activity } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty, TableLoading,
} from "@/components/ui/table";
import { AdminPage } from "../_components/admin-page";

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteBreakdown = {
  route: string;
  request_count: number;
  avg_latency_ms: number;
  error_count: number;
};

type OrgStats = {
  org_id: string;
  org_name: string;
  request_count: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_count: number;
  error_rate_pct: number;
  routes: RouteBreakdown[];
};

type ResourceData = {
  window: string;
  orgs: OrgStats[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [
  { value: "1h",  label: "1 ชั่วโมงที่ผ่านมา" },
  { value: "6h",  label: "6 ชั่วโมงที่ผ่านมา" },
  { value: "24h", label: "24 ชั่วโมงที่ผ่านมา" },
  { value: "7d",  label: "7 วันที่ผ่านมา" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function HealthBadge({ errorRate }: { errorRate: number }) {
  if (errorRate >= 5) return <StatusBadge tone="danger">🔴 Critical</StatusBadge>;
  if (errorRate >= 1) return <StatusBadge tone="warning">🟡 Warning</StatusBadge>;
  return <StatusBadge tone="success">🟢 Good</StatusBadge>;
}

function LatencyBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color =
    value > 500 ? "bg-red-400" : value > 200 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-600">{value} ms</span>
    </div>
  );
}

function RequestBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-indigo-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-600">{value.toLocaleString()}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResourcesPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [window, setWindow]       = useState("1h");
  const [data, setData]           = useState<ResourceData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const authHeader = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl(`/admin/resources?window=${window}`), { headers: h });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "โหลดข้อมูลไม่สำเร็จ"); return; }
      setData(json as ResourceData);
      setLastRefreshed(new Date());
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [window, authHeader]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(loadData, 60_000);
    return () => clearInterval(id);
  }, [loadData]);

  if (authLoading) return <div className="p-6 text-sm text-gray-500">กำลังโหลด…</div>;
  if (role !== "super_admin") return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <Title as="h1" className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึงหน้านี้</Title>
    </div>
  );

  const orgs = data?.orgs ?? [];
  const maxRequests = Math.max(...orgs.map((o) => o.request_count), 1);
  const maxLatency  = Math.max(...orgs.map((o) => o.p95_latency_ms), 1);

  const totalRequests = orgs.reduce((s, o) => s + o.request_count, 0);
  const totalErrors   = orgs.reduce((s, o) => s + o.error_count, 0);
  const avgLatency    = orgs.length
    ? Math.round(orgs.reduce((s, o) => s + o.avg_latency_ms, 0) / orgs.length)
    : 0;
  const alertOrgs     = orgs.filter((o) => o.error_rate_pct >= 1);

  return (
    <AdminPage
      width="full"
      title="Tenant Resource Monitor"
      icon={<Activity className="h-6 w-6" />}
      description={
        <>
          API performance per org • auto-refresh ทุก 60 วินาที
          {lastRefreshed && (
            <span className="ml-2 text-xs text-gray-400">
              อัปเดตล่าสุด {lastRefreshed.toLocaleTimeString("th-TH")}
            </span>
          )}
        </>
      }
      actions={
        <>
          <CustomSelect
            value={window}
            onChange={setWindow}
            options={WINDOW_OPTIONS}
            className="w-44"
          />
        </>
      }
    >
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            icon={<Zap className="h-4 w-4 text-indigo-500" />}
            label="Total Requests"
            value={totalRequests.toLocaleString()}
            sub={`ใน ${WINDOW_OPTIONS.find((w) => w.value === window)?.label}`}
          />
          <SummaryCard
            icon={<Clock className="h-4 w-4 text-emerald-500" />}
            label="Avg Latency"
            value={`${avgLatency} ms`}
            sub="เฉลี่ยทุก org"
          />
          <SummaryCard
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            label="5xx Errors"
            value={totalErrors.toLocaleString()}
            sub={totalErrors > 0 ? `${((totalErrors / Math.max(totalRequests, 1)) * 100).toFixed(1)}% error rate` : "ไม่มี error"}
            alert={totalErrors > 0}
          />
          <SummaryCard
            icon={<TrendingUp className="h-4 w-4 text-amber-500" />}
            label="Orgs Active"
            value={String(orgs.length)}
            sub={alertOrgs.length > 0 ? `${alertOrgs.length} org มี warning` : "ทุก org ปกติ"}
            alert={alertOrgs.length > 0}
          />
        </div>
      )}

      {/* Alert banner for problem orgs */}
      {alertOrgs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-800">⚠️ Orgs ที่มี error rate สูง</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {alertOrgs.map((o) => (
              <span
                key={o.org_id}
                className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-800"
              >
                {o.org_name} — {o.error_rate_pct}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-org table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organization</TableHead>
            <TableHead>Requests</TableHead>
            <TableHead>Latency (avg / p95)</TableHead>
            <TableHead>Error Rate</TableHead>
            <TableHead align="center">Health</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && !data ? (
            <TableLoading colSpan={5} />
          ) : orgs.length === 0 ? (
            <TableEmpty colSpan={5}>
              ยังไม่มีข้อมูล metrics — เพิ่ม <code className="rounded bg-gray-100 px-1">recordMetric()</code> ใน API routes เพื่อเริ่มเก็บข้อมูล
            </TableEmpty>
          ) : orgs.map((org) => {
            const isExpanded = expandedOrg === org.org_id;
            return (
              <React.Fragment key={org.org_id}>
                <TableRow clickable selected={isExpanded} onClick={() => setExpandedOrg(isExpanded ? null : org.org_id)}>
                  <TableCell>
                    <span className="font-medium text-gray-900">{org.org_name}</span>
                    {isExpanded ? (
                      <span className="ml-2 text-xs text-indigo-500">▲ ซ่อน routes</span>
                    ) : org.routes.length > 0 ? (
                      <span className="ml-2 text-xs text-gray-400">▼ {org.routes.length} routes</span>
                    ) : null}
                  </TableCell>
                  <TableCell><RequestBar value={org.request_count} max={maxRequests} /></TableCell>
                  <TableCell>
                    <LatencyBar value={org.avg_latency_ms} max={maxLatency} />
                    <span className="mt-0.5 block text-xs text-gray-400">p95: {org.p95_latency_ms} ms</span>
                  </TableCell>
                  <TableCell>
                    {org.error_count > 0 ? (
                      <span className="font-medium text-red-600">{org.error_count} ({org.error_rate_pct}%)</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </TableCell>
                  <TableCell align="center"><HealthBadge errorRate={org.error_rate_pct} /></TableCell>
                </TableRow>
                {isExpanded && org.routes.length > 0 && (
                  <tr className="bg-indigo-50/20">
                    <td colSpan={5} className="px-4 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">Top Routes</p>
                      <div className="space-y-1.5">
                        {org.routes.map((r) => (
                          <div
                            key={r.route}
                            className="flex items-center gap-4 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs"
                          >
                            <span className="min-w-[200px] flex-1 font-mono text-gray-700">{r.route}</span>
                            <span className="whitespace-nowrap text-gray-600">{r.request_count.toLocaleString()} req</span>
                            <span className="whitespace-nowrap text-gray-500">{r.avg_latency_ms} ms avg</span>
                            {r.error_count > 0 ? (
                              <span className="whitespace-nowrap font-medium text-red-600">{r.error_count} err</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>

      {/* Integration guide */}
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/40 p-5">
        <p className="text-sm font-semibold text-gray-700">📊 วิธีเพิ่ม Metrics ใน API Route</p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700">
{`import { recordMetric } from '@/lib/metrics';

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const orgId = '...'; // org id ของ request นี้

  // ... handler logic ...

  const res = NextResponse.json({ ok: true });
  void recordMetric({ orgId, route: '/api/tmc/finance', method: req.method, status: 200, t0 });
  return res;
}`}
        </pre>
      </div>
    </AdminPage>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, sub, alert = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${alert ? "border-amber-200 bg-amber-50/30" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${alert ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
