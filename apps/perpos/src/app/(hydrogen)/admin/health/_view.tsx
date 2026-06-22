"use client";

/**
 * HealthView — ส่วน interactive ของหน้า Tenant Health
 * รับ initialOrgs จาก server component (ไม่มี client waterfall แรก) แล้ว poll /api/admin/health
 * ทุก 60 วิ · filter (grade) + expand/collapse เป็น client-side บนข้อมูลที่มีอยู่
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  ChevronDown,
  ChevronRight,
  Wifi,
  WebhookIcon,
  Clock,
  CreditCard,
  Wrench,
  HeartPulse,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdminPage } from "../_components/admin-page";
import { AdminTabs, SYSTEM_TABS } from "../_components/admin-tabs";
import type { OrgHealth, FactorStatus, Grade } from "@/lib/admin/health";

const GRADE_COLOR: Record<Grade, string> = {
  A: "bg-green-50  border border-green-200  text-green-700",
  B: "bg-blue-50   border border-blue-200   text-blue-700",
  C: "bg-yellow-50 border border-yellow-200 text-yellow-700",
  D: "bg-orange-50 border border-orange-200 text-orange-700",
  F: "bg-red-50    border border-red-200    text-red-700",
};

const SCORE_BAR: Record<Grade, string> = {
  A: "bg-green-500",
  B: "bg-blue-500",
  C: "bg-yellow-500",
  D: "bg-orange-500",
  F: "bg-red-500",
};

const STATUS_DOT: Record<FactorStatus, string> = {
  ok: "bg-green-500",
  warning: "bg-yellow-400",
  critical: "bg-red-500",
};

function fmtDate(s: string | null) {
  if (!s) return "ไม่มีข้อมูล";
  return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function ScoreCircle({ score, grade }: { score: number; grade: Grade }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative h-16 w-16 flex-shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-gray-200" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          className={SCORE_BAR[grade].replace("bg-", "stroke-")}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold leading-none text-gray-900">{score}</span>
        <span className={`text-xs font-bold ${GRADE_COLOR[grade].split(" ")[1]}`}>{grade}</span>
      </div>
    </div>
  );
}

function FactorRow({
  icon,
  label,
  status,
  detail,
  deduction,
}: {
  icon: React.ReactNode;
  label: string;
  status: FactorStatus;
  detail: string;
  deduction: number;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-gray-100 py-2 last:border-0">
      <div className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[status]}`} />
      <div className="flex-shrink-0 text-gray-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        <div className="mt-0.5 truncate text-xs text-gray-400">{detail}</div>
      </div>
      {deduction > 0 && (
        <span className="flex-shrink-0 text-xs font-medium text-red-500">−{deduction}</span>
      )}
    </div>
  );
}

const FILTER_OPTIONS = [
  { value: "all", label: "ทุก org" },
  { value: "critical", label: "เฉพาะ Critical (F/D)" },
  { value: "warning", label: "เฉพาะ Warning (C)" },
  { value: "healthy", label: "เฉพาะ Healthy (A/B)" },
];

export function HealthView({ initialOrgs }: { initialOrgs: OrgHealth[] }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orgs, setOrgs] = useState<OrgHealth[]>(initialOrgs);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/health", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const d = (await res.json()) as { orgs?: OrgHealth[]; error?: string };
      if (!res.ok) {
        setError(d.error ?? "Error");
        return;
      }
      setOrgs(d.orgs ?? []);
      setError("");
      setLastRefresh(new Date());
    } catch {
      setError("Network error");
    }
  }, [supabase]);

  // ตั้งเวลา refresh ทุก 60 วิ (initial มาจาก server แล้ว ไม่ต้องโหลดรอบแรก)
  useEffect(() => {
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = orgs.filter((o) => {
    if (filter === "critical") return ["F", "D"].includes(o.grade);
    if (filter === "warning") return o.grade === "C";
    if (filter === "healthy") return ["A", "B"].includes(o.grade);
    return true;
  });

  const counts = {
    A: orgs.filter((o) => o.grade === "A").length,
    B: orgs.filter((o) => o.grade === "B").length,
    C: orgs.filter((o) => o.grade === "C").length,
    D: orgs.filter((o) => o.grade === "D").length,
    F: orgs.filter((o) => o.grade === "F").length,
  };
  const avgScore =
    orgs.length > 0 ? Math.round(orgs.reduce((s, o) => s + o.health_score, 0) / orgs.length) : 0;

  return (
    <AdminPage
      title="ระบบ & โครงสร้าง"
      icon={<HeartPulse className="h-6 w-6" />}
      tabs={<AdminTabs items={SYSTEM_TABS} />}
      description={
        <>
          คะแนนสุขภาพของแต่ละ org
          {lastRefresh && (
            <span className="ml-2 text-gray-400">
              อัปเดตล่าสุด {lastRefresh.toLocaleTimeString("th-TH")}
            </span>
          )}
        </>
      }
    >
      {/* Summary */}
      <div className="grid grid-cols-6 gap-3">
        <div className="col-span-2 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div>
            <div className="text-3xl font-bold text-gray-900">{avgScore}</div>
            <div className="text-xs text-gray-500">คะแนนเฉลี่ย</div>
          </div>
        </div>
        {(["A", "B", "C", "D", "F"] as Grade[]).map((g) => (
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Org cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          ไม่พบ org ที่ตรงกับตัวกรอง
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const isOpen = expanded.has(o.org_id);
            return (
              <div
                key={o.org_id}
                className={`overflow-hidden rounded-xl border transition-shadow ${
                  o.grade === "F"
                    ? "border-red-200"
                    : o.grade === "D"
                      ? "border-orange-200"
                      : o.grade === "C"
                        ? "border-yellow-200"
                        : "border-gray-200"
                }`}
              >
                <button
                  onClick={() => toggleExpand(o.org_id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50"
                >
                  <ScoreCircle score={o.health_score} grade={o.grade} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{o.org_name}</span>
                      {o.maintenance_mode && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs text-orange-700">
                          <Wrench className="h-3 w-3" />
                          Maintenance
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      {(
                        [
                          ["API", o.factors.api.status],
                          ["Webhooks", o.factors.webhooks.status],
                          ["Activity", o.factors.activity.status],
                          ["Billing", o.factors.billing.status],
                        ] as [string, FactorStatus][]
                      ).map(([name, s]) => (
                        <span key={name} className="flex items-center gap-1 text-xs text-gray-500">
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s]}`} />
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  )}
                </button>

                {isOpen && (
                  <div className="space-y-0 border-t border-gray-100 bg-gray-50 px-5 py-4">
                    <FactorRow
                      icon={<Wifi className="h-3.5 w-3.5" />}
                      label="API Health (24h)"
                      status={o.factors.api.status}
                      detail={`${o.factors.api.request_count.toLocaleString()} requests — ${o.factors.api.error_rate_pct}% error rate (${o.factors.api.error_count} errors)`}
                      deduction={o.factors.api.deduction}
                    />
                    <FactorRow
                      icon={<WebhookIcon className="h-3.5 w-3.5" />}
                      label="Webhook Deliveries (7d)"
                      status={o.factors.webhooks.status}
                      detail={`${o.factors.webhooks.delivery_count} deliveries — ${o.factors.webhooks.failure_rate_pct}% failure rate (${o.factors.webhooks.failure_count} failed)`}
                      deduction={o.factors.webhooks.deduction}
                    />
                    <FactorRow
                      icon={<Clock className="h-3.5 w-3.5" />}
                      label="Last Activity"
                      status={o.factors.activity.status}
                      detail={
                        o.factors.activity.last_seen_at
                          ? `${fmtDate(o.factors.activity.last_seen_at)} (${o.factors.activity.days_since ?? 0} วันที่แล้ว)`
                          : "ไม่มีกิจกรรมใน 24 ชั่วโมงที่ผ่านมา"
                      }
                      deduction={o.factors.activity.deduction}
                    />
                    <FactorRow
                      icon={<CreditCard className="h-3.5 w-3.5" />}
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
    </AdminPage>
  );
}
