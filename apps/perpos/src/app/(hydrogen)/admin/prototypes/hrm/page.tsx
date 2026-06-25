"use client";

// Dashboard — ภาพรวม HR ธุรกิจจิ๋ว (prototype)
// KPI คำนวณจาก fixtures จริง + วันสำคัญใกล้ถึง + ใบลารออนุมัติ + AI insight (mock §6.1)
// guard super_admin อยู่ที่ layout.tsx แล้ว → หน้านี้เป็น client interactive ได้

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Wallet,
  CalendarOff,
  CalendarClock,
  Sparkles,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  AlertTriangle,
  CalendarDays,
  Cake,
  FileSignature,
  Clock,
  MessageCircleQuestion,
  BookText,
} from "lucide-react";
import cn from "@core/utils/class-names";

import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";

import {
  MOCK_EMPLOYEES,
  UPCOMING_REMINDERS,
  MOCK_LEAVE_REQUESTS,
  MOCK_LEAVE_TYPES,
  summarizePayrollRun2606,
  MOCK_PAYROLL_RUNS,
  MOCK_AI_COST_SUMMARY,
  MOCK_AI_DASHBOARD_INSIGHTS,
  MOCK_AI_HR_QA,
} from "./_fixtures";
import { HrmShell, fmtMoney, fmtMoneyShort, fmtNum, fullName, daysUntil } from "./_components";

const BASE = "/admin/prototypes/hrm";

// ป้าย tone ตามความใกล้ของวันสำคัญ
function reminderTone(daysLeft: number): BadgeTone {
  if (daysLeft <= 7) return "danger";
  if (daysLeft <= 21) return "warning";
  return "info";
}

const REMINDER_ICON = {
  contract_end: <FileSignature className="h-4 w-4" />,
  probation_end: <CalendarClock className="h-4 w-4" />,
  birthday: <Cake className="h-4 w-4" />,
} as const;

export default function HrmDashboardPage() {
  // ── KPI จาก fixtures (deterministic) ──
  const kpi = useMemo(() => {
    const activeCount = MOCK_EMPLOYEES.filter((e) => e.status === "active").length;
    const payroll = summarizePayrollRun2606();
    const currentRun = MOCK_PAYROLL_RUNS.find((r) => r.id === "run-2026-06");
    const pendingLeaves = MOCK_LEAVE_REQUESTS.filter((l) => l.status === "pending");
    return {
      activeCount,
      employerCost: currentRun?.total_employer_cost ?? payroll.employerCost,
      pendingLeaveCount: pendingLeaves.length,
      reminderCount: UPCOMING_REMINDERS.length,
    };
  }, []);

  const empById = useMemo(() => new Map(MOCK_EMPLOYEES.map((e) => [e.id, e])), []);
  const leaveTypeById = useMemo(() => new Map(MOCK_LEAVE_TYPES.map((t) => [t.id, t])), []);

  const pendingLeaves = useMemo(
    () =>
      MOCK_LEAVE_REQUESTS.filter((l) => l.status === "pending").sort((a, b) =>
        a.start_date.localeCompare(b.start_date),
      ),
    [],
  );

  return (
    <HrmShell
      title="ภาพรวม"
      icon={<LayoutDashboard className="h-6 w-6" />}
      description="สุขภาพ HR ในจอเดียว — พนักงาน ต้นทุนเงินเดือน ใบลา วันสำคัญ + AI ช่วยสรุป"
      actions={
        <Button asChild>
          <Link href={`${BASE}/payroll?new=1`}>
            <Wallet className="mr-1.5 h-4 w-4" />
            ทำรอบเงินเดือนเดือนนี้
          </Link>
        </Button>
      }
    >
      {/* ── KPI ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`${BASE}/employees`} className="block">
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="พนักงานที่ทำงานอยู่"
            value={fmtNum(kpi.activeCount)}
            sub="คนในความดูแลขณะนี้"
            tone="primary"
          />
        </Link>
        <Link href={`${BASE}/payroll`} className="block">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="ต้นทุนเงินเดือนเดือนนี้"
            value={fmtMoneyShort(kpi.employerCost)}
            sub={`รวมปกส.นายจ้าง · ${fmtMoney(kpi.employerCost)}`}
            tone="info"
            valueColored
          />
        </Link>
        <Link href={`${BASE}/leave`} className="block">
          <StatCard
            icon={<CalendarOff className="h-4 w-4" />}
            label="ใบลารออนุมัติ"
            value={fmtNum(kpi.pendingLeaveCount)}
            sub="รอผู้ดูแลตัดสิน"
            tone={kpi.pendingLeaveCount > 0 ? "warning" : "neutral"}
            valueColored={kpi.pendingLeaveCount > 0}
          />
        </Link>
        <Link href={`${BASE}/employees`} className="block">
          <StatCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="วันสำคัญใกล้ถึง"
            value={fmtNum(kpi.reminderCount)}
            sub="ครบทดลอง/ต่อสัญญา/วันเกิด"
            tone={kpi.reminderCount > 0 ? "warning" : "positive"}
            valueColored={kpi.reminderCount > 0}
          />
        </Link>
      </div>

      {/* ── วันสำคัญ + ใบลารออนุมัติ (actionable มาก่อน) ── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* วันสำคัญใกล้ถึง */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div className="text-sm font-semibold text-gray-900">วันสำคัญใกล้ถึง</div>
          </div>
          {UPCOMING_REMINDERS.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              ไม่มีวันสำคัญใน 30 วันข้างหน้า
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {UPCOMING_REMINDERS.map((r) => {
                const left = daysUntil(r.date) ?? r.days_left;
                return (
                  <li
                    key={`${r.employee_id}-${r.type}`}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                      {REMINDER_ICON[r.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {r.employee_name}
                      </div>
                      <div className="text-xs text-gray-500">{r.label}</div>
                    </div>
                    <StatusBadge tone={reminderTone(left)}>อีก {fmtNum(left)} วัน</StatusBadge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ใบลารออนุมัติ */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <CalendarOff className="h-4 w-4" />
              </span>
              <div className="text-sm font-semibold text-gray-900">ใบลารออนุมัติ</div>
            </div>
            <Link
              href={`${BASE}/leave`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              ดูทั้งหมด
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {pendingLeaves.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">ไม่มีใบลารออนุมัติ</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pendingLeaves.map((l) => {
                const emp = empById.get(l.employee_id);
                const lt = leaveTypeById.get(l.leave_type_id);
                return (
                  <li key={l.id}>
                    <Link
                      href={`${BASE}/leave`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                        <CalendarOff className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {emp ? fullName(emp) : "—"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {lt?.name ?? "ลา"} · {fmtNum(l.days)} วัน
                        </div>
                      </div>
                      <StatusBadge tone="warning">รออนุมัติ</StatusBadge>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ── ผู้ช่วย AI (สรุปต้นทุน + ถาม-ตอบ HR) ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <Text as="span" className="text-sm font-semibold text-gray-700">
            ผู้ช่วย AI
          </Text>
        </div>
        <AiCostSummaryCard />
        <AiHrQaCard />
      </section>
    </HrmShell>
  );
}

// ─── AI สรุปต้นทุน + insight (mock §6.1) ───
function AiCostSummaryCard() {
  const data = MOCK_AI_COST_SUMMARY;
  const insights = MOCK_AI_DASHBOARD_INSIGHTS;
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(true); // โชว์ผลตั้งแต่แรก (canned)

  function reanalyze() {
    setLoading(true);
    setAnalyzed(false);
    setTimeout(() => {
      setLoading(false);
      setAnalyzed(true);
    }, 1200);
  }

  const insightIconTone = (priority: "warning" | "error" | "info") =>
    priority === "error"
      ? "bg-red-50 text-red-600"
      : priority === "warning"
        ? "bg-amber-50 text-amber-600"
        : "bg-blue-50 text-blue-600";

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">AI สรุปต้นทุนพนักงาน</span>
              <StatusBadge tone="info">AI</StatusBadge>
            </div>
            <div className="text-xs text-gray-400">
              วิเคราะห์จากรอบ {data.period} (ผู้ช่วยสรุป — โปรดตรวจทาน)
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={reanalyze} disabled={loading}>
          <Sparkles className="mr-1.5 h-4 w-4" />
          {loading ? "กำลังวิเคราะห์…" : "วิเคราะห์ใหม่"}
        </Button>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded bg-gray-100" />
            <div className="h-16 rounded bg-gray-100" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="h-10 rounded bg-gray-100" />
              <div className="h-10 rounded bg-gray-100" />
              <div className="h-10 rounded bg-gray-100" />
            </div>
            <p className="text-center text-sm text-gray-400">AI กำลังวิเคราะห์ต้นทุนพนักงาน…</p>
          </div>
        ) : analyzed ? (
          <div className="space-y-4">
            {/* สรุปข้อความ */}
            <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-lg font-semibold tabular-nums tracking-tight text-gray-900">
                  {fmtMoney(data.total_employer_cost)}
                </span>
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600">
                  +{fmtMoney(data.vs_last_month_amount, { currency: false })} ฿ (
                  {data.vs_last_month_pct}%) จากเดือนก่อน
                </span>
              </div>
              <Text className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
                {data.summary_text}
              </Text>
            </div>

            {/* insight chips */}
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-700">สิ่งที่ควรติดตาม</div>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {insights.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <span
                      className={
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg " +
                        insightIconTone(it.priority)
                      }
                    >
                      {it.priority === "error" ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : it.priority === "warning" ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <CalendarClock className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-900">{it.title}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{it.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-gray-400">
              ตัวเลขคำนวณจากข้อมูลรอบจริงก่อนส่งให้ AI เรียบเรียง (กัน AI นับเลขคลาดเคลื่อน) —
              โปรดตรวจทานก่อนตัดสินใจ
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── AI ถาม-ตอบกฎหมายแรงงาน/HR (mock §6.4) ───
function AiHrQaCard() {
  const items = MOCK_AI_HR_QA.slice(0, 3);
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <MessageCircleQuestion className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">ถาม-ตอบกฎหมายแรงงาน/HR</span>
            <StatusBadge tone="info">AI</StatusBadge>
          </div>
          <div className="text-xs text-gray-400">
            คำถามที่เจอบ่อย — AI สรุปอ้างอิงกฎหมาย โปรดตรวจทานก่อนใช้อ้างอิงจริง
          </div>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((qa) => {
          const open = openId === qa.id;
          return (
            <li key={qa.id}>
              <Button
                variant="ghost"
                onClick={() => setOpenId(open ? null : qa.id)}
                className="h-auto w-full justify-between gap-3 rounded-none px-5 py-3 text-left font-normal hover:bg-gray-50"
              >
                <span className="min-w-0 text-sm font-medium text-gray-900">{qa.question}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-gray-400 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </Button>
              {open && (
                <div className="space-y-2 px-5 pb-4 pl-5">
                  <Text className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
                    {qa.answer}
                  </Text>
                  {qa.sources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <BookText className="h-3.5 w-3.5 text-gray-400" />
                      {qa.sources.map((s) => (
                        <StatusBadge key={s} tone="neutral">
                          {s}
                        </StatusBadge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
