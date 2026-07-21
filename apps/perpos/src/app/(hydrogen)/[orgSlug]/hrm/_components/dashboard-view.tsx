"use client";

// dashboard-view.tsx — มุมมองภาพรวม HR (client, presentational)
// data มาจาก server (lib/hrm/dashboard) ทั้งหมด — ไม่ fetch ตอน mount, ไม่มี mock AI
// คัด layout จาก prototype dashboard แต่ตัด AI panel + ผูกข้อมูลจริง

import Link from "next/link";
import {
  Users,
  TrendingUp,
  CalendarOff,
  CalendarClock,
  CalendarDays,
  Cake,
  FileSignature,
  Wallet,
  ChevronRight,
} from "lucide-react";

import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type { HrmDashboard, HrmReminder } from "@/lib/hrm/dashboard";
import { fmtMoney, fmtMoneyShort, fmtNum } from "./format";

function reminderTone(daysLeft: number): BadgeTone {
  if (daysLeft <= 7) return "danger";
  if (daysLeft <= 21) return "warning";
  return "info";
}

const REMINDER_ICON: Record<HrmReminder["kind"], React.ReactNode> = {
  contract_end: <FileSignature className="h-4 w-4" />,
  probation_end: <CalendarClock className="h-4 w-4" />,
  birthday: <Cake className="h-4 w-4" />,
};

const REMINDER_LABEL: Record<HrmReminder["kind"], string> = {
  contract_end: "ครบกำหนดสัญญาจ้าง",
  probation_end: "ครบกำหนดทดลองงาน",
  birthday: "วันเกิด",
};

export function HrmDashboardView({ data, orgSlug }: { data: HrmDashboard; orgSlug: string }) {
  const base = `/${orgSlug}/hrm`;
  const reminders = data.upcoming_reminders;

  return (
    <div className="space-y-5">
      {/* ── KPI ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`${base}/employees`} className="block">
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="พนักงานที่ทำงานอยู่"
            value={fmtNum(data.headcount_active)}
            sub="คนในความดูแลขณะนี้"
            tone="primary"
          />
        </Link>
        <Link href={`${base}/payroll`} className="block">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="ต้นทุนเงินเดือนรอบล่าสุด"
            value={fmtMoneyShort(data.latest_employer_cost)}
            sub={
              data.latest_run
                ? `รวมปกส.นายจ้าง · ${fmtMoney(data.latest_employer_cost)}`
                : "ยังไม่มีรอบที่จ่าย"
            }
            tone="info"
            valueColored
          />
        </Link>
        <Link href={`${base}/leave`} className="block">
          <StatCard
            icon={<CalendarOff className="h-4 w-4" />}
            label="ใบลารออนุมัติ"
            value={fmtNum(data.pending_leave)}
            sub="รอผู้ดูแลตัดสิน"
            tone={data.pending_leave > 0 ? "warning" : "neutral"}
            valueColored={data.pending_leave > 0}
          />
        </Link>
        <Link href={`${base}/employees`} className="block">
          <StatCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="วันสำคัญใกล้ถึง"
            value={fmtNum(reminders.length)}
            sub="ครบทดลอง/ต่อสัญญา/วันเกิด"
            tone={reminders.length > 0 ? "warning" : "positive"}
            valueColored={reminders.length > 0}
          />
        </Link>
      </div>

      {/* ── วันสำคัญ + ปุ่มลัด ── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* วันสำคัญใกล้ถึง */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div className="text-sm font-semibold text-gray-900">วันสำคัญใกล้ถึง (30 วัน)</div>
          </div>
          {reminders.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              ไม่มีวันสำคัญใน 30 วันข้างหน้า
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {reminders.map((r) => (
                <li
                  key={`${r.employee_id}-${r.kind}`}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                    {REMINDER_ICON[r.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {r.employee_name}
                    </div>
                    <div className="text-xs text-gray-500">{REMINDER_LABEL[r.kind]}</div>
                  </div>
                  <StatusBadge tone={reminderTone(r.days_until)}>
                    อีก {fmtNum(r.days_until)} วัน
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ปุ่มลัด */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">
            ทางลัด
          </div>
          <div className="space-y-2 p-4">
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href={`${base}/payroll`}>
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  ทำรอบเงินเดือน
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href={`${base}/employees`}>
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  จัดการพนักงาน
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href={`${base}/leave`}>
                <span className="flex items-center gap-2">
                  <CalendarOff className="h-4 w-4" />
                  ใบลา {data.pending_leave > 0 ? `(${fmtNum(data.pending_leave)} รอ)` : ""}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
