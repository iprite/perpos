"use client";

// page.tsx — ภาพรวม 3 ชั้น (Contract v3 §4 หน้า 1 / Review Log b6)
//   ชั้น 1 "ต้องจัดการวันนี้" — การ์ดคลิกแล้วกระโดดไปหน้างานจริงพร้อมตัวกรอง
//   ชั้น 2 pipeline 5 ช่วง (order_stage) — คลิกเข้าบอร์ดออเดอร์ของช่วงนั้น
//   ชั้น 3 KPI 6 ใบ (มีคู่เทียบ baseline "ก่อนมีระบบ") + section "สำหรับเจ้าของ" 🔒 แยกกริด
// ตัวเลขทุกตัวมาจาก _fixtures/metrics.ts + baseline.ts/benchmarks.ts (แหล่งเดียว — ห้ามคำนวณเองในหน้า)

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Clock,
  Coins,
  LayoutDashboard,
  MessageSquare,
  Repeat,
  Timer,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { baselineComparison } from "./_fixtures/baseline";
import { benchmark } from "./_fixtures/benchmarks";
import { dashboardMetrics } from "./_fixtures/metrics";
import { ORDER_STAGES } from "./_fixtures/labels";
import {
  MATTII_BASE,
  MattiiShell,
  SectionHeading,
  fmtMoney,
  fmtNum,
  fmtPercent,
  useMattiiData,
  useMattiiRole,
} from "./_components";
import { RiskBriefingPanel } from "./risk-briefing";

export default function MattiiOverviewPage() {
  const { isOwner } = useMattiiRole();
  const { orders, orderItems, materials, shipments, printJobs } = useMattiiData();

  // ตัวเลขทุกใบคิดจาก state สดชุดเดียวกับหน้าอื่น (รับเข้าสต๊อก/เก็บ COD แล้วการ์ดนี้ขยับทันที)
  const m = useMemo(
    () => dashboardMetrics(orders, { materials, shipments, printJobs, orderItems }),
    [orders, materials, shipments, printJobs, orderItems],
  );
  const comparison = useMemo(() => baselineComparison(orders), [orders]);
  const replyTimeRow = comparison.find((r) => r.key === "reply_time_minutes");

  return (
    <MattiiShell
      title="ภาพรวม"
      description="งานที่ต้องจัดการวันนี้ · งานในสายพาน · และผลลัพธ์ที่ระบบช่วยได้เทียบกับก่อนมีระบบ"
      icon={<LayoutDashboard className="h-6 w-6" />}
    >
      {/* ── ชั้น 1: ต้องจัดการวันนี้ (คลิกเพื่อไปทำงานต่อ) ── */}
      <div>
        <SectionHeading>ต้องจัดการวันนี้</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href={`${MATTII_BASE}/orders?filter=overdue`}
            className="block min-w-0 rounded-xl transition-shadow hover:shadow-md"
          >
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="เลยกำหนดส่ง"
              value={fmtNum(m.overdueCount)}
              sub="ยังไม่ส่งและเลยวันที่สัญญาไว้ — กดเพื่อดูรายการ"
              tone="negative"
              valueColored
            />
          </Link>
          <Link
            href={`${MATTII_BASE}/orders?filter=stale_cf`}
            className="block min-w-0 rounded-xl transition-shadow hover:shadow-md"
          >
            <StatCard
              icon={<Timer className="h-4 w-4" />}
              label="ค้างรอลูกค้ายืนยันลาย ≥ 2 วัน"
              value={fmtNum(m.staleAwaitingCfCount)}
              sub="ตามลูกค้าให้ไว ลดเวลารอทั้งสาย"
              tone="warning"
              valueColored
            />
          </Link>
          <Link
            href={`${MATTII_BASE}/materials?low=1`}
            className="block min-w-0 rounded-xl transition-shadow hover:shadow-md"
          >
            <StatCard
              icon={<Boxes className="h-4 w-4" />}
              label="วัสดุใกล้หมด"
              value={fmtNum(m.lowStockMaterialsCount)}
              sub="ต่ำกว่าจุดสั่งซื้อซ้ำ — สั่งเพิ่มก่อนสายผลิตหยุด"
              tone="warning"
              valueColored
            />
          </Link>
          <Link
            // COD = เงินปลายทางของ "พัสดุ" → ต้องไปหน้าจัดส่งพร้อมตัวกรอง COD ค้างเก็บ
            // (ไม่ใช่ /payments?view=outstanding ที่เป็นออเดอร์ค้างชำระ คนละชุดข้อมูล)
            href={`${MATTII_BASE}/shipments?cod=cod_pending`}
            className="block min-w-0 rounded-xl transition-shadow hover:shadow-md"
          >
            <StatCard
              icon={<Truck className="h-4 w-4" />}
              label="COD ค้างเก็บ"
              value={fmtMoney(m.codPendingAmount)}
              sub={`${fmtNum(m.codPendingCount)} พัสดุที่ยังไม่ได้เงินปลายทาง — กดเพื่อดูรายการ`}
              tone="info"
            />
          </Link>
        </div>
      </div>

      {/* ── AI §5.5: สรุปงานเสี่ยงวันนี้เป็นภาษาคน + ควรทำอะไรก่อน (mock) ── */}
      <RiskBriefingPanel />

      {/* ── ชั้น 2: งานในสายพาน 5 ช่วง ── */}
      <div>
        <SectionHeading>งานในสายพาน (คลิกเพื่อเปิดบอร์ดออเดอร์ช่วงนั้น)</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ORDER_STAGES.map((s) => (
            <Link
              key={s.key}
              href={`${MATTII_BASE}/orders?view=board&stage=${s.key}`}
              className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors duration-150 hover:bg-gray-50"
            >
              <div className="truncate text-xs font-medium text-gray-500">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {fmtNum(m.byStage[s.key])}
              </div>
              <div className="mt-0.5 text-xs text-gray-400">ออเดอร์</div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── ชั้น 3: KPI 6 ใบ พร้อมคู่เทียบ "ก่อนมีระบบ" ── */}
      <div>
        <SectionHeading>ผลลัพธ์ตอนนี้ เทียบกับก่อนมีระบบ</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="รับออเดอร์ → ส่งถึงมือลูกค้า"
            value={`${fmtNum(m.avgLeadTimeDays, 1)} วัน`}
            sub={`เดิม ~${fmtNum(benchmark.lead_time_baseline_days, 1)} วัน`}
            tone="positive"
            valueColored
          />
          <StatCard
            icon={<Timer className="h-4 w-4" />}
            label="เวลารอลูกค้ายืนยันลาย"
            value={`${fmtNum(m.avgCfWaitDays, 1)} วัน`}
            sub={`เดิม ~${fmtNum(benchmark.cf_wait_baseline_days, 1)} วัน`}
            tone="positive"
            valueColored
          />
          <StatCard
            icon={<Repeat className="h-4 w-4" />}
            label="อัตราพิมพ์ซ้ำจาก QC ไม่ผ่าน"
            value={fmtPercent(m.reprintRatePercent)}
            sub={`เดิม ~${fmtPercent(benchmark.reprint_rate_baseline)} — พิมพ์ซ้ำน้อยลง = เสียผ้า/หมึกน้อยลง`}
            tone="positive"
            valueColored
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="อัตราส่งช้ากว่ากำหนด"
            value={fmtPercent(m.lateRatePercent)}
            sub={`เดิม ~${fmtPercent(benchmark.late_rate_baseline)}`}
            tone="positive"
            valueColored
          />
          <StatCard
            icon={<MessageSquare className="h-4 w-4" />}
            label="เวลาตอบแชทเฉลี่ย"
            value={`${fmtNum(replyTimeRow?.after ?? 0)} นาที`}
            sub={`เดิม ~${fmtNum(benchmark.reply_time_baseline_minutes)} นาที (กล่องแชทรวมที่เดียว)`}
            tone="positive"
            valueColored
          />
          <StatCard
            icon={<Wallet className="h-4 w-4" />}
            label="ยอดขายรวมในระบบ"
            value={fmtMoney(m.totalSales)}
            sub={`${fmtNum(m.countedOrders)} ออเดอร์ที่ติดตามอยู่ (ไม่รวมที่ยกเลิก)`}
            tone="info"
          />
        </div>
      </div>

      {/* ── 🔒 section สำหรับเจ้าของ — role อื่นตัดทั้ง section (§2.3 ข้อ 1) ── */}
      {isOwner && (
        <div>
          <SectionHeading>สำหรับเจ้าของ</SectionHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              icon={<Coins className="h-4 w-4" />}
              label="ต้นทุนรวม"
              value={fmtMoney(m.totalCost)}
              sub={
                m.estimatedOrders > 0
                  ? `ต้นทุนจริงจากสายผลิต + ประมาณการอีก ${fmtNum(m.estimatedOrders)} ใบที่ยังไม่เริ่มผลิต`
                  : "รวมค่าวัสดุ ค่าแรง ค่าเครื่อง และค่าขนส่ง"
              }
              tone="neutral"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="กำไรขั้นต้น"
              value={fmtMoney(m.grossProfit)}
              tone={m.grossProfit >= 0 ? "positive" : "negative"}
              valueColored
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="อัตรากำไรเฉลี่ย"
              value={fmtPercent(m.marginPercent)}
              sub={`จาก ${fmtNum(m.countedOrders)} ออเดอร์ (ไม่รวมที่ยกเลิก)`}
              tone={m.marginPercent >= 0 ? "positive" : "negative"}
              valueColored
            />
          </div>
        </div>
      )}

      {/* ── ตารางเทียบ ก่อน / หลังใช้ระบบ ── */}
      <div>
        <SectionHeading>ก่อน / หลังใช้ระบบ</SectionHeading>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>ตัวชี้วัด</TableHead>
              <TableHead align="right">ก่อนมีระบบ</TableHead>
              <TableHead align="right">ตอนนี้</TableHead>
              <TableHead align="right">หน่วย</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparison.map((row) => {
              // after = null → ยังไม่มีค่าปัจจุบันให้เทียบ (เช่น ออเดอร์/เดือน — fixture เป็นภาพ ณ ขณะหนึ่ง)
              const after = row.after;
              const better =
                after === null
                  ? false
                  : row.lowerIsBetter
                    ? after < row.before
                    : after > row.before;
              return (
                <TableRow key={row.key}>
                  <TableCell wrap>{row.label}</TableCell>
                  <TableCell align="right" className="tabular-nums text-gray-500">
                    {fmtNum(row.before, row.before % 1 === 0 ? 0 : 1)}
                  </TableCell>
                  <TableCell
                    align="right"
                    className={
                      better
                        ? "font-medium tabular-nums text-green-600"
                        : "font-medium tabular-nums text-gray-900"
                    }
                  >
                    {after === null
                      ? "ยังไม่มีข้อมูลเทียบ"
                      : fmtNum(after, after % 1 === 0 ? 0 : 1)}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums text-gray-500">
                    {row.unit}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Text className="mt-1.5 px-1 text-xs text-gray-400">
          ค่า &quot;ก่อนมีระบบ&quot; ({benchmark.source_note})
          เป็นประมาณการจากเจ้าของร้านเพื่อใช้เล่าเรื่องในการนำเสนอ ไม่ใช่สถิติที่วัดจากระบบเดิม
        </Text>
      </div>
    </MattiiShell>
  );
}
