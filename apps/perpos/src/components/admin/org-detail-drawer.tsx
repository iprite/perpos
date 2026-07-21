"use client";

/**
 * OrgDetailDrawer — Org 360° panel (super admin)
 *
 * รวมทุกอย่างของ 1 องค์กรไว้ใน slide-over เดียว: plan/billing, health, สมาชิก,
 * modules, API 7 วัน, activity ล่าสุด + ปุ่มลงมือ (toggle maintenance, ลิงก์จัดการ)
 * เปิดจากที่ไหนก็ได้ผ่าน <OrgLink> / useOrgDrawer (ดู org-link.tsx)
 *
 * ดึงข้อมูลจาก GET /api/admin/orgs/[id] (lib/admin/org-detail.ts)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  Activity,
  HeartPulse,
  Wrench,
  Loader2,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { PLAN_LABELS } from "@/lib/billing";
import { useDrawer } from "@/app/shared/drawer-views/use-drawer";
import type { OrgDetail } from "@/lib/admin/org-detail";

const GRADE_TONE: Record<string, BadgeTone> = {
  A: "success",
  B: "info",
  C: "warning",
  D: "warning",
  F: "danger",
};

const baht = (n: number | null) =>
  n == null ? "—" : "฿" + new Intl.NumberFormat("th-TH").format(n);

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      {children}
    </div>
  );
}

export function OrgDetailDrawer({ orgId }: { orgId: string }) {
  const { closeDrawer } = useDrawer();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const token = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "error");
      setData(json.detail as OrgDetail);
    } catch {
      toast.error("โหลดข้อมูลองค์กรไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [orgId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleMaintenance() {
    if (!data) return;
    const next = !data.org.maintenance_mode;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ orgId, maintenanceMode: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next ? "เปิด Maintenance แล้ว" : "ปิด Maintenance แล้ว");
      setData((d) => (d ? { ...d, org: { ...d.org, maintenance_mode: next } } : d));
    } catch {
      toast.error("อัปเดตไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const apiTotal = data?.api_7d.reduce((s, d) => s + d.requests, 0) ?? 0;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-gray-900">
            {data?.org.name ?? "กำลังโหลด…"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {data?.billing && (
              <StatusBadge tone="neutral">{PLAN_LABELS[data.billing.plan_tier]}</StatusBadge>
            )}
            {data?.health && (
              <StatusBadge tone={GRADE_TONE[data.health.grade] ?? "neutral"}>
                Health {data.health.grade}
              </StatusBadge>
            )}
            {data?.org.maintenance_mode && <StatusBadge tone="warning">Maintenance</StatusBadge>}
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center px-5 text-sm text-gray-400">
          ไม่พบข้อมูลองค์กร
        </div>
      ) : (
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<CreditCard className="h-4 w-4" />}
              label="ราคา/เดือน"
              value={baht(data.billing?.monthly_price ?? null)}
              tone="info"
            />
            <StatCard
              icon={<HeartPulse className="h-4 w-4" />}
              label="Health"
              value={data.health ? String(data.health.score) : "—"}
              tone="positive"
            />
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="สมาชิก"
              value={String(data.members.length)}
              tone="neutral"
            />
            <StatCard
              icon={<Activity className="h-4 w-4" />}
              label="API 7 วัน"
              value={apiTotal.toLocaleString()}
              tone="primary"
            />
          </div>

          {/* API sparkline */}
          <Section title="API requests (7 วัน)">
            <div className="rounded-xl border border-gray-200 bg-white p-2">
              <ResponsiveContainer width="100%" height={56}>
                <AreaChart data={data.api_7d} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="orgApiSpark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3C3B3D" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3C3B3D" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    labelFormatter={(d) => `วันที่ ${d}`}
                    formatter={(v: number) => [`${v} req`, "requests"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    stroke="#3C3B3D"
                    strokeWidth={1.5}
                    fill="url(#orgApiSpark)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Billing */}
          <Section title="Billing">
            <dl className="space-y-1.5 text-sm">
              <Row label="สถานะชำระ" value={data.billing?.payment_status ?? "—"} />
              <Row label="หมดอายุ plan" value={fmtDate(data.billing?.plan_ends_at ?? null)} />
              <Row
                label="ทดลองเหลือ"
                value={
                  data.billing?.trial_days_remaining != null
                    ? `${data.billing.trial_days_remaining} วัน`
                    : "—"
                }
              />
            </dl>
          </Section>

          {/* Modules */}
          <Section title={`Modules ที่เปิด (${data.modules.length})`}>
            {data.modules.length === 0 ? (
              <p className="text-sm text-gray-400">ยังไม่เปิด module ใด</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.modules.map((m) => (
                  <span
                    key={m.key}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-600"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* Members */}
          <Section title={`สมาชิก (${data.members.length})`}>
            <div className="divide-y divide-gray-100">
              {data.members.slice(0, 8).map((m) => (
                <div key={m.user_id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0 truncate text-gray-700">{m.email || m.user_id}</span>
                  <span className="shrink-0 text-xs text-gray-400">{m.role}</span>
                </div>
              ))}
              {data.members.length > 8 && (
                <div className="pt-1.5 text-xs text-gray-400">+ อีก {data.members.length - 8} คน</div>
              )}
            </div>
          </Section>

          {/* Activity */}
          {data.recent_audit.length > 0 && (
            <Section title="กิจกรรมล่าสุด">
              <div className="space-y-1.5">
                {data.recent_audit.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-gray-600">
                      {a.action}
                      {a.actor_email ? ` · ${a.actor_email}` : ""}
                    </span>
                    <span className="shrink-0 text-gray-400">{fmtDate(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* Actions */}
      {data && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3">
          <Button
            variant={data.org.maintenance_mode ? "secondary" : "outline"}
            size="sm"
            disabled={busy}
            onClick={toggleMaintenance}
          >
            <Wrench className="mr-1.5 h-4 w-4" />
            {data.org.maintenance_mode ? "ปิด Maintenance" : "เปิด Maintenance"}
          </Button>
          <Link href="/admin/billing" onClick={closeDrawer}>
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1.5 h-4 w-4" /> จัดการ Billing
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800">{value}</dd>
    </div>
  );
}
