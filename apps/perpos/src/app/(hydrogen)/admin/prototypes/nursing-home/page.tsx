"use client";

// Dashboard — แดชบอร์ดศูนย์ดูแลผู้สูงอายุ (prototype)
// KPI คำนวณจาก fixtures จริง + AI insight cards (A1/A6 mock) + ลิงก์ลึก
// guard super_admin อยู่ที่ layout.tsx แล้ว → หน้านี้เป็น client interactive ได้

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BedDouble,
  Users,
  Pill,
  AlertTriangle,
  Wallet,
  ReceiptText,
  HeartPulse,
  Sparkles,
  ClipboardCheck,
  ChevronRight,
  Layers,
} from "lucide-react";

import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import {
  RESIDENTS,
  BEDS,
  MEDICATION_ADMINISTRATIONS,
  INCIDENT_REPORTS,
  VITAL_SIGNS,
  INVOICES,
  AR_AGING_SUMMARY,
  MOCK_DASHBOARD_AI_INSIGHTS,
  MOCK_SHIFT_HANDOVER_A6,
} from "./_fixtures";
import type { CareLevel } from "./_fixtures/types";
import { NursingShell, fmtMoney, fmtMoneyShort, fmtNum } from "./_components";

const BASE = "/admin/prototypes/nursing-home";
const TODAY = "2026-06-22";

export default function NursingDashboardPage() {
  // ── คำนวณ KPI จาก fixtures (deterministic) ──
  const kpi = useMemo(() => {
    const activeResidents = RESIDENTS.filter((r) => r.status === "active");
    const totalBeds = BEDS.length;
    const occupiedBeds = BEDS.filter((b) => b.status === "occupied").length;
    const occupancyPct = totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    const byCareLevel: Record<CareLevel, number> = {
      independent: 0,
      assisted: 0,
      full_care: 0,
      memory_care: 0,
    };
    for (const r of activeResidents) byCareLevel[r.care_level] += 1;

    // รอบยาวันนี้ค้าง = pending + missed (วันนี้)
    const todayAdmins = MEDICATION_ADMINISTRATIONS.filter((a) => a.scheduled_at.startsWith(TODAY));
    const medPending = todayAdmins.filter((a) => a.status === "pending").length;
    const medMissed = todayAdmins.filter((a) => a.status === "missed").length;
    const medGiven = todayAdmins.filter((a) => a.status === "given").length;
    const medCompliancePct = todayAdmins.length
      ? Math.round((medGiven / todayAdmins.length) * 100)
      : 0;

    const incidentsOpen = INCIDENT_REPORTS.filter(
      (i) => i.status === "open" || i.status === "investigating",
    ).length;

    // vital ผิดปกติวันนี้ (flag != normal, measured วันนี้)
    const vitalsToday = VITAL_SIGNS.filter((v) => v.measured_at.startsWith(TODAY));
    const vitalsAbnormal = vitalsToday.filter(
      (v) => v.flag === "abnormal" || v.flag === "watch",
    ).length;

    // รายได้เดือนนี้ (period 2026-06, ไม่นับ void/draft)
    const monthInvoices = INVOICES.filter(
      (i) => i.period_month === "2026-06" && i.status !== "void" && i.status !== "draft",
    );
    const monthRevenue = monthInvoices.reduce((s, i) => s + i.total, 0);
    const monthCollected = monthInvoices.reduce((s, i) => s + i.paid_amount, 0);

    return {
      activeCount: activeResidents.length,
      totalBeds,
      occupiedBeds,
      occupancyPct,
      byCareLevel,
      medPending,
      medMissed,
      medGiven,
      medTotal: todayAdmins.length,
      medCompliancePct,
      incidentsOpen,
      vitalsAbnormal,
      monthRevenue,
      monthCollected,
      arOutstanding: AR_AGING_SUMMARY.total_outstanding,
    };
  }, []);

  return (
    <NursingShell
      title="แดชบอร์ด"
      icon={<Layers className="h-6 w-6" />}
      description="ภาพรวมทั้งศูนย์ — อัตราเข้าพัก สุขภาพ/ยา เหตุการณ์ การเงิน + AI ช่วยเตือน"
    >
      {/* ── แถวที่ 1: KPI ดำเนินงาน ── */}
      <section>
        <SectionLabel>ภาพรวมการดำเนินงาน (วันนี้)</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href={`${BASE}/rooms`} className="block">
            <StatCard
              icon={<BedDouble className="h-4 w-4" />}
              label="อัตราเข้าพัก"
              value={`${kpi.occupancyPct}%`}
              sub={`${kpi.occupiedBeds}/${kpi.totalBeds} เตียง`}
              tone="info"
              valueColored
            />
          </Link>
          <Link href={`${BASE}/residents`} className="block">
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="ผู้พักอาศัย (พักอยู่)"
              value={fmtNum(kpi.activeCount)}
              sub={`ดูแลเต็มรูปแบบ ${kpi.byCareLevel.full_care} · ความจำ ${kpi.byCareLevel.memory_care}`}
              tone="primary"
            />
          </Link>
          <Link href={`${BASE}/medications`} className="block">
            <StatCard
              icon={<Pill className="h-4 w-4" />}
              label="รอบยาวันนี้ค้าง"
              value={fmtNum(kpi.medPending + kpi.medMissed)}
              sub={`รอให้ ${kpi.medPending} · พลาด ${kpi.medMissed} · ให้ครบ ${kpi.medCompliancePct}%`}
              tone={kpi.medMissed > 0 ? "warning" : "neutral"}
              valueColored={kpi.medMissed > 0}
            />
          </Link>
          <Link href={`${BASE}/incidents`} className="block">
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="เหตุการณ์ที่เปิดอยู่"
              value={fmtNum(kpi.incidentsOpen)}
              sub="รอสืบสวน/แก้ไข"
              tone={kpi.incidentsOpen > 0 ? "negative" : "positive"}
              valueColored
            />
          </Link>
        </div>
      </section>

      {/* ── แถวที่ 2: สุขภาพ + การเงิน ── */}
      <section>
        <SectionLabel>สุขภาพ & การเงิน</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link href={`${BASE}/vitals`} className="block">
            <StatCard
              icon={<HeartPulse className="h-4 w-4" />}
              label="สัญญาณชีพผิดปกติวันนี้"
              value={fmtNum(kpi.vitalsAbnormal)}
              sub="เฝ้าระวัง + ผิดปกติ"
              tone={kpi.vitalsAbnormal > 0 ? "warning" : "positive"}
              valueColored
            />
          </Link>
          <Link href={`${BASE}/invoices`} className="block">
            <StatCard
              icon={<Wallet className="h-4 w-4" />}
              label="รายได้เดือนนี้ (มิ.ย.)"
              value={fmtMoneyShort(kpi.monthRevenue)}
              sub={`เก็บแล้ว ${fmtMoney(kpi.monthCollected)}`}
              tone="positive"
            />
          </Link>
          <Link href={`${BASE}/payments`} className="block">
            <StatCard
              icon={<ReceiptText className="h-4 w-4" />}
              label="ยอดค้างชำระ (AR)"
              value={fmtMoneyShort(kpi.arOutstanding)}
              sub={`เกินกำหนด ${AR_AGING_SUMMARY.overdue_30.count + AR_AGING_SUMMARY.overdue_60.count} ราย`}
              tone="negative"
              valueColored
            />
          </Link>
        </div>
      </section>

      {/* ── AI section ── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <AiRiskCard />
        <ShiftHandoverCard />
      </section>
    </NursingShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-sm font-semibold text-gray-700">{children}</div>;
}

// ─── AI การ์ดเตือนความเสี่ยง (A1 mock) ───
function AiRiskCard() {
  const insights = MOCK_DASHBOARD_AI_INSIGHTS;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">AI เตือนความเสี่ยง</div>
          <div className="text-xs text-gray-400">
            วิเคราะห์จากสัญญาณชีพ + เหตุการณ์ (ผู้ช่วยเตือน — พยาบาลตรวจทาน)
          </div>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {insights.map((it) => (
          <li key={it.id} className="flex items-start gap-3 px-5 py-3">
            <span
              className={
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg " +
                (it.type === "incident_open"
                  ? "bg-red-50 text-red-600"
                  : "bg-amber-50 text-amber-600")
              }
            >
              {it.type === "incident_open" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <HeartPulse className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900">{it.title}</div>
              <div className="mt-0.5 text-sm text-gray-500">{it.detail}</div>
            </div>
            <Link
              href={`${BASE}${it.action_href.startsWith("/vitals") ? "/vitals" : "/incidents"}`}
              className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {it.action_label}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── AI สรุปส่งเวร (A6 mock) ───
function ShiftHandoverCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const h = MOCK_SHIFT_HANDOVER_A6;

  function handleGenerate() {
    setOpen(true);
    setLoading(true);
    setGenerated(false);
    // จำลอง latency AI
    setTimeout(() => {
      setLoading(false);
      setGenerated(true);
    }, 1400);
  }

  function handleCopy() {
    void navigator.clipboard?.writeText(h.handover_summary);
    toast.success("คัดลอกสรุปส่งเวรแล้ว");
  }

  return (
    <>
      <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <ClipboardCheck className="h-4 w-4" />
          </span>
          <div className="text-sm font-semibold text-gray-900">สรุปส่งเวร (AI)</div>
        </div>
        <Text className="mt-2 text-sm text-gray-500">
          ปลายกะ ให้ AI เรียบเรียงสิ่งที่ต้องส่งต่อ — รวมรายชื่อต้องเฝ้าระวัง ยาค้าง
          และงานที่ต้องตามต่อ
        </Text>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <MiniStat label="เฝ้าระวัง" value={h.watch_list.length} tone="warning" />
          <MiniStat
            label="ยาค้าง/พลาด"
            value={h.stats.meds_missed + h.stats.meds_refused + h.stats.meds_held}
            tone="warning"
          />
          <MiniStat label="เหตุการณ์เปิด" value={h.stats.incidents_open} tone="danger" />
        </div>
        <Button className="mt-4 w-full" onClick={handleGenerate}>
          <Sparkles className="mr-2 h-4 w-4" />
          สรุปส่งเวรด้วย AI
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                สรุปส่งเวร — {h.handover_from}
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {loading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-1/3 rounded bg-gray-100" />
                <div className="h-20 rounded bg-gray-100" />
                <div className="h-4 w-1/4 rounded bg-gray-100" />
                <div className="h-16 rounded bg-gray-100" />
                <p className="text-center text-sm text-gray-400">AI กำลังเรียบเรียงสรุปส่งเวร…</p>
              </div>
            ) : generated ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                  <div className="mb-1 text-xs font-medium text-gray-500">
                    ส่งต่อให้: {h.handover_to}
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                    {h.handover_summary}
                  </p>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-700">
                    รายชื่อต้องเฝ้าระวัง ({h.watch_list.length})
                  </div>
                  <ul className="space-y-2">
                    {h.watch_list.map((w) => (
                      <li
                        key={w.resident_id}
                        className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                      >
                        <span
                          className={
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full " +
                            (w.priority === "high" ? "bg-red-500" : "bg-amber-500")
                          }
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{w.resident_name}</div>
                          <div className="text-sm text-gray-500">{w.reason}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-700">
                    งานที่ต้องตามต่อ ({h.pending_actions.length})
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
                    {h.pending_actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>

                <p className="text-xs text-gray-400">
                  ตัวเลขสรุปคำนวณจากข้อมูลจริงก่อนส่งให้ AI เรียบเรียง (กัน AI นับเลขคลาดเคลื่อน) —
                  โปรดตรวจทานก่อนส่งต่อ
                </p>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ปิด
            </Button>
            <Button onClick={handleCopy} disabled={!generated}>
              คัดลอกสรุป
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "danger";
}) {
  const color = tone === "danger" ? "text-red-600" : "text-amber-600";
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-2">
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}
