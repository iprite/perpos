"use client";

// reports/page.tsx — รายงานรวมศูนย์ดูแลผู้สูงอายุ (prototype, มุมมองสรุป)
// ทุกตัวเลขคำนวณจาก fixtures จริง (rule-based, ไม่ใช่ AI) · auto-load ตาม filter ช่วงเวลา

import { useMemo, useState } from "react";
import { BarChart3, BedDouble, Banknote, ClipboardList, AlertTriangle, Pill } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableFooter,
} from "@/components/ui/table";
import { NursingShell, fmtMoney, fmtMoneyShort, fmtMonthTH, fmtNum } from "../_components";
import {
  RESIDENTS,
  BEDS,
  INVOICES,
  MEDICATION_ADMINISTRATIONS,
  INCIDENT_REPORTS,
  CARE_PLANS,
  DAILY_CARE_LOGS,
  arOutstandingTotal,
} from "../_fixtures";
import type { CareLevel, IncidentType, IncidentSeverity } from "../_fixtures/types";

// ── ตัวเลือกช่วงเวลา (auto-load) ──
type Range = "month" | "q" | "year";
const RANGE_OPTS = [
  { value: "month", label: "เดือนนี้ (มิ.ย. 2569)" },
  { value: "q", label: "3 เดือนล่าสุด" },
  { value: "year", label: "ปีนี้ (2569)" },
];
// ช่วงเดือน period_month ที่นับเข้ารายงาน — fixture มีถึง 2026-06
const RANGE_MONTHS: Record<Range, string[]> = {
  month: ["2026-06"],
  q: ["2026-04", "2026-05", "2026-06"],
  year: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
};

const CARE_LABEL: Record<CareLevel, string> = {
  independent: "ช่วยเหลือตัวเองได้",
  assisted: "ช่วยเหลือบางส่วน",
  full_care: "ดูแลเต็มรูปแบบ",
  memory_care: "ดูแลความจำ",
};

const INCIDENT_LABEL: Record<IncidentType, string> = {
  fall: "การล้ม",
  medication_error: "ความผิดพลาดเรื่องยา",
  injury: "บาดเจ็บ",
  behavioral: "พฤติกรรม",
  medical_emergency: "ภาวะฉุกเฉินทางการแพทย์",
  elopement: "หลบหนีออกนอกพื้นที่",
  other: "อื่นๆ",
};

export default function NursingReportsPage() {
  const [range, setRange] = useState<Range>("month");
  // จำลอง loading สั้นๆ เมื่อเปลี่ยน filter (auto-load — ไม่มีปุ่ม refresh)
  const [loading, setLoading] = useState(false);
  function onRangeChange(v: string) {
    setRange(v as Range);
    setLoading(true);
    setTimeout(() => setLoading(false), 350);
  }

  const months = RANGE_MONTHS[range];

  const report = useMemo(() => {
    // ── 1) อัตราเข้าพัก ──
    const totalBeds = BEDS.length;
    const occupiedBeds = BEDS.filter((b) => b.status === "occupied").length;
    const occupancyPct = totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
    const activeResidents = RESIDENTS.filter((r) => r.status === "active");
    const byCare: Record<CareLevel, number> = {
      independent: 0,
      assisted: 0,
      full_care: 0,
      memory_care: 0,
    };
    for (const r of activeResidents) byCare[r.care_level] += 1;

    // ── 2) รายได้ (period_month อยู่ในช่วง, ไม่นับ void/draft) ──
    // "ค้างเก็บ" = ยอดค้างชำระ (AR) ของบิลในช่วง → ใช้ arOutstandingTotal สูตรเดียวกับทุกหน้า
    // หมายเหตุ: นี่คือ AR เฉพาะช่วงที่เลือก (period-scoped) — เลือก "ปีนี้" จะได้ยอดเท่ากับ
    //   AR snapshot ของ dashboard/invoices/payments
    const inRange = INVOICES.filter(
      (i) => months.includes(i.period_month) && i.status !== "void" && i.status !== "draft",
    );
    const billed = inRange.reduce((s, i) => s + i.total, 0);
    const collected = inRange.reduce((s, i) => s + i.paid_amount, 0);
    const outstanding = arOutstandingTotal(inRange);
    const collectRate = billed ? Math.round((collected / billed) * 100) : 0;
    // แนวโน้มรายเดือน (เก่า→ใหม่) สำหรับ sparkline + ตาราง
    const byMonth = months.map((m) => {
      const ms = INVOICES.filter(
        (i) => i.period_month === m && i.status !== "void" && i.status !== "draft",
      );
      return {
        month: m,
        billed: ms.reduce((s, i) => s + i.total, 0),
        collected: ms.reduce((s, i) => s + i.paid_amount, 0),
        outstanding: arOutstandingTotal(ms),
        count: ms.length,
      };
    });

    // ── 3) คุณภาพการดูแล ──
    const cpTotal = CARE_PLANS.length;
    const cpCompleted = CARE_PLANS.filter((c) => c.status === "completed").length;
    const cpActive = CARE_PLANS.filter((c) => c.status === "active").length;
    const cpCompletionPct = cpTotal ? Math.round((cpCompleted / cpTotal) * 100) : 0;
    // ครอบคลุมบันทึกประจำวัน = ผู้พัก active ที่มี log วันนี้ / ทั้งหมด
    const today = "2026-06-22";
    const loggedResidentIds = new Set(
      DAILY_CARE_LOGS.filter((l) => l.logged_at.startsWith(today)).map((l) => l.resident_id),
    );
    const logCovered = activeResidents.filter((r) => loggedResidentIds.has(r.id)).length;
    const logCoveragePct = activeResidents.length
      ? Math.round((logCovered / activeResidents.length) * 100)
      : 0;

    // ── 4) เหตุการณ์ (incident) ──
    const incByType: Record<string, number> = {};
    const incBySeverity: Record<IncidentSeverity, number> = {
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
    };
    let incOpen = 0;
    for (const inc of INCIDENT_REPORTS) {
      incByType[inc.incident_type] = (incByType[inc.incident_type] ?? 0) + 1;
      incBySeverity[inc.severity] += 1;
      if (inc.status === "open" || inc.status === "investigating") incOpen += 1;
    }
    const incClosed = INCIDENT_REPORTS.length - incOpen;
    const incTypeRows = (Object.keys(incByType) as IncidentType[])
      .map((t) => ({ type: t, count: incByType[t] }))
      .sort((a, b) => b.count - a.count);

    // ── 5) ยา compliance (rule-based) ──
    const adm = MEDICATION_ADMINISTRATIONS;
    const given = adm.filter((a) => a.status === "given").length;
    const missed = adm.filter((a) => a.status === "missed").length;
    const refused = adm.filter((a) => a.status === "refused").length;
    const held = adm.filter((a) => a.status === "held").length;
    const pending = adm.filter((a) => a.status === "pending").length;
    // หารด้วยรอบที่ครบกำหนดแล้ว (ไม่นับ pending = ยังไม่ถึงเวลา)
    const dueCount = adm.length - pending;
    const givenPct = dueCount ? Math.round((given / dueCount) * 100) : 0;

    return {
      occupancyPct,
      occupiedBeds,
      totalBeds,
      byCare,
      activeCount: activeResidents.length,
      billed,
      collected,
      outstanding,
      collectRate,
      byMonth,
      cpCompletionPct,
      cpCompleted,
      cpActive,
      cpTotal,
      logCoveragePct,
      logCovered,
      logTotal: activeResidents.length,
      incByType: incTypeRows,
      incBySeverity,
      incOpen,
      incClosed,
      incTotal: INCIDENT_REPORTS.length,
      given,
      missed,
      refused,
      held,
      dueCount,
      givenPct,
      medTotal: adm.length,
    };
  }, [months]);

  return (
    <NursingShell
      title="รายงานรวม"
      description="ภาพรวมเชิงบริหาร — เข้าพัก รายได้ คุณภาพการดูแล เหตุการณ์ และการให้ยา (คำนวณจากข้อมูลจริง)"
      icon={<BarChart3 className="h-6 w-6" />}
      actions={
        <CustomSelect
          className="w-52"
          value={range}
          onChange={onRangeChange}
          options={RANGE_OPTS}
        />
      }
    >
      {loading ? (
        <ReportSkeleton />
      ) : (
        <>
          {/* ── 1) อัตราเข้าพัก ── */}
          <Section title="อัตราเข้าพัก">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={<BedDouble className="h-4 w-4" />}
                label="อัตราเข้าพัก"
                value={`${report.occupancyPct}%`}
                sub={`${report.occupiedBeds}/${report.totalBeds} เตียง`}
                tone="info"
                valueColored
              />
              <StatCard
                icon={<BedDouble className="h-4 w-4" />}
                label="เตียงว่าง"
                value={fmtNum(report.totalBeds - report.occupiedBeds)}
                sub="พร้อมรับผู้พักใหม่"
                tone="neutral"
              />
              <StatCard
                icon={<ClipboardList className="h-4 w-4" />}
                label="ผู้พักอาศัย (พักอยู่)"
                value={fmtNum(report.activeCount)}
                sub="แยกตามระดับการดูแลด้านล่าง"
                tone="primary"
              />
            </div>
            <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 text-sm font-medium text-gray-900">แยกตามระดับการดูแล</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(Object.keys(report.byCare) as CareLevel[]).map((lv) => (
                  <div
                    key={lv}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                  >
                    <div className="text-xs text-gray-400">{CARE_LABEL[lv]}</div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-gray-900">
                      {fmtNum(report.byCare[lv])}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ── 2) รายได้ ── */}
          <Section title="รายได้">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={<Banknote className="h-4 w-4" />}
                label="ออกบิลรวม"
                value={fmtMoneyShort(report.billed)}
                sub={fmtMoney(report.billed)}
                tone="primary"
                spark={report.byMonth.map((m) => m.billed)}
              />
              <StatCard
                icon={<Banknote className="h-4 w-4" />}
                label="เก็บได้แล้ว"
                value={fmtMoneyShort(report.collected)}
                sub={fmtMoney(report.collected)}
                tone="positive"
                valueColored
                spark={report.byMonth.map((m) => m.collected)}
              />
              <StatCard
                icon={<Banknote className="h-4 w-4" />}
                label="อัตราการเก็บเงิน"
                value={`${report.collectRate}%`}
                sub={`ค้างเก็บ ${fmtMoney(report.outstanding)}`}
                tone={report.collectRate >= 80 ? "positive" : "warning"}
                valueColored
              />
            </div>
            <div className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เดือน</TableHead>
                    <TableHead align="center">จำนวนบิล</TableHead>
                    <TableHead align="right">ออกบิล</TableHead>
                    <TableHead align="right">เก็บได้</TableHead>
                    <TableHead align="right">ค้างเก็บ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byMonth.length === 0 ? (
                    <TableEmpty colSpan={5}>ไม่มีข้อมูลรายได้ในช่วงนี้</TableEmpty>
                  ) : (
                    report.byMonth.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium text-gray-900">
                          {fmtMonthTH(m.month)}
                        </TableCell>
                        <TableCell align="center" tabular>
                          {fmtNum(m.count)}
                        </TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(m.billed)}
                        </TableCell>
                        <TableCell align="right" tabular className="text-green-600">
                          {fmtMoney(m.collected)}
                        </TableCell>
                        <TableCell align="right" tabular className="text-amber-600">
                          {fmtMoney(m.outstanding)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell align="right" colSpan={2}>
                      รวม
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtMoney(report.billed)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtMoney(report.collected)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtMoney(report.outstanding)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </Section>

          {/* ── 3) คุณภาพการดูแล ── */}
          <Section title="คุณภาพการดูแล">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={<ClipboardList className="h-4 w-4" />}
                label="แผนดูแลที่เสร็จสมบูรณ์"
                value={`${report.cpCompletionPct}%`}
                sub={`${report.cpCompleted}/${report.cpTotal} แผน · กำลังดำเนินการ ${report.cpActive}`}
                tone="info"
                valueColored
              />
              <StatCard
                icon={<ClipboardList className="h-4 w-4" />}
                label="ครอบคลุมบันทึกประจำวัน"
                value={`${report.logCoveragePct}%`}
                sub={`${report.logCovered}/${report.logTotal} คนมีบันทึกวันนี้`}
                tone={report.logCoveragePct >= 80 ? "positive" : "warning"}
                valueColored
              />
              <StatCard
                icon={<ClipboardList className="h-4 w-4" />}
                label="แผนที่กำลังดำเนินการ"
                value={fmtNum(report.cpActive)}
                sub="ต้องติดตามทบทวนตามรอบ"
                tone="neutral"
              />
            </div>
          </Section>

          {/* ── 4) เหตุการณ์ ── */}
          <Section title="แนวโน้มเหตุการณ์ (Incident)">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="เหตุการณ์ทั้งหมด"
                value={fmtNum(report.incTotal)}
                sub={`เปิดอยู่ ${report.incOpen} · ปิดแล้ว ${report.incClosed}`}
                tone="neutral"
              />
              <StatCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="ยังเปิดอยู่"
                value={fmtNum(report.incOpen)}
                sub="รอสืบสวน/แก้ไข"
                tone={report.incOpen > 0 ? "negative" : "positive"}
                valueColored
              />
              <StatCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="รุนแรง+วิกฤต"
                value={fmtNum(report.incBySeverity.high + report.incBySeverity.critical)}
                sub={`ปานกลาง ${report.incBySeverity.moderate} · เล็กน้อย ${report.incBySeverity.low}`}
                tone={
                  report.incBySeverity.high + report.incBySeverity.critical > 0
                    ? "warning"
                    : "positive"
                }
                valueColored
              />
            </div>
            <div className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ประเภทเหตุการณ์</TableHead>
                    <TableHead align="right">จำนวน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.incByType.length === 0 ? (
                    <TableEmpty colSpan={2}>ไม่มีเหตุการณ์</TableEmpty>
                  ) : (
                    report.incByType.map((row) => (
                      <TableRow key={row.type}>
                        <TableCell className="text-gray-900">{INCIDENT_LABEL[row.type]}</TableCell>
                        <TableCell align="right" tabular>
                          {fmtNum(row.count)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Section>

          {/* ── 5) การให้ยา (rule-based) ── */}
          <Section title="การให้ยาตามรอบ (Medication Compliance)">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={<Pill className="h-4 w-4" />}
                label="ให้ยาครบตามรอบ"
                value={`${report.givenPct}%`}
                sub={`ให้แล้ว ${report.given}/${report.dueCount} รอบที่ถึงกำหนด`}
                tone={report.givenPct >= 90 ? "positive" : "warning"}
                valueColored
              />
              <StatCard
                icon={<Pill className="h-4 w-4" />}
                label="พลาด/ปฏิเสธ"
                value={fmtNum(report.missed + report.refused)}
                sub={`พลาด ${report.missed} · ปฏิเสธ ${report.refused}`}
                tone={report.missed + report.refused > 0 ? "negative" : "positive"}
                valueColored
              />
              <StatCard
                icon={<Pill className="h-4 w-4" />}
                label="พักยา (ตามคำสั่งแพทย์)"
                value={fmtNum(report.held)}
                sub="รอแพทย์ทบทวน"
                tone="neutral"
              />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              ตัวเลขการให้ยาคำนวณตรงจากบันทึก eMAR จริง (rule-based) — ไม่ใช่การประมาณการโดย AI
            </p>
          </Section>
        </>
      )}
    </NursingShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-sm font-semibold text-gray-700">{title}</div>
      {children}
    </section>
  );
}

function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {[...Array(3)].map((_, s) => (
        <div key={s} className="space-y-3">
          <div className="h-4 w-32 rounded bg-gray-100" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
