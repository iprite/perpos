"use client";

// receivables/page.tsx — เงินค้างรับ / SLA / aging (spec §5 #5)
// เฉพาะงาน stage=delivered (ส่งของแล้ว ยังไม่รับเช็ค) เรียง aging มาก→น้อย
// StatCard: ยอดค้างรับรวม / จำนวนงานค้าง / จำนวน+ยอด overdue (จาก receivableSummary — rule ล้วน)
// Table primitives: หน่วยงาน+กอง / บริษัท / net_receivable / วันส่งมอบ / aging(Aging/OverdueBadge)
//   / คาดวันรับเช็ค (AI-3 rule: median duration ต่อกอง + delivery_date) + badge เสี่ยงถ้าคาดเกิน SLA
// row clickable → DetailDialog · footer sum ยอดค้างรวม
// AI-3: ปุ่มเล็ก/popover "วิเคราะห์แนวโน้ม AI" ต่อแถว → canned AI_FORECAST_MOCKS (loading จำลอง)
// empty = GOOD-NEWS (tone บวก) ถ้าไม่มี overdue · state ว่างปกติถ้าไม่มีงาน delivered · loading = skeleton
// ห้ามปุ่ม refresh (P2-e) — auto-render จาก state

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  CheckCircle2,
  PackageOpen,
  CalendarClock,
  AlertTriangle,
  Sparkles,
  Loader2,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { Popover } from "@/components/ui/popover";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { GovProcureShell, useData, fmtMoney, fmtNum, fmtDateTH } from "../_components";
import { OverdueBadge, AgingBadge, CompanyBadge } from "../_components/badges";
import { receivableSummary, isRealized } from "../_components/money";
import { TODAY_DATE } from "../_components/format";
import { deriveDurationDays, type GovProcureOrder } from "../_fixtures/types";
import { AI_FORECAST_MOCKS, type GovProcureForecastNarration } from "../_fixtures/ai-mocks";
import { DetailDialog } from "../_components/detail-dialog";
import { OrderDialog } from "../_components/order-dialog";
import { StageMoveDialog } from "../_components/stage-move-dialog";

/**
 * AI-3 (rule-only) — คาดวันรับเช็ค = delivery_date + median(duration_days ต่อกอง)
 * duration_days วัดจากงานที่ปิดแล้ว (paid/closed) ที่มี contract_date+receipt_date ครบในกองเดียวกัน
 * ถ้ากองนั้นไม่มีข้อมูลอ้างอิง → ใช้ median ของทั้งพอร์ต · คืน null ถ้าไม่มีเลย
 */
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

interface ChequeForecast {
  medianDays: number | null; // จำนวนวันมัธยฐานที่ใช้ (กอง หรือ พอร์ต)
  scope: "dept" | "portfolio" | "none"; // แหล่งข้อมูลมัธยฐาน
  expectedIso: string | null; // วันคาดรับเช็ค (ISO)
}

function buildForecast(order: GovProcureOrder, orders: GovProcureOrder[]): ChequeForecast {
  // รวบรวม duration ของงานที่ปิดแล้ว (มี contract+receipt) — ต่อกอง + ทั้งพอร์ต
  const closedDurations: { dept: string | null; days: number }[] = [];
  for (const o of orders) {
    if (!isRealized(o)) continue;
    const d = deriveDurationDays(o);
    if (d == null) continue;
    closedDurations.push({ dept: o.department, days: d });
  }
  const portfolioMedian = median(closedDurations.map((x) => x.days));
  const deptMedian = order.department
    ? median(closedDurations.filter((x) => x.dept === order.department).map((x) => x.days))
    : null;

  const chosen = deptMedian ?? portfolioMedian;
  const scope: ChequeForecast["scope"] =
    deptMedian != null ? "dept" : portfolioMedian != null ? "portfolio" : "none";

  let expectedIso: string | null = null;
  if (chosen != null && order.delivery_date) {
    // สัญญา→รับเช็ค เฉลี่ย chosen วัน; นับต่อจากวันส่งมอบเป็น proxy (prototype rule)
    const base = new Date(order.delivery_date).getTime();
    const expected = new Date(base + chosen * 86_400_000);
    expectedIso = expected.toISOString().slice(0, 10);
  }
  return { medianDays: chosen, scope, expectedIso };
}

/** คาดวัน "เกิน SLA" ไหม = (expected − delivery_date) > sla_threshold */
function forecastAtRisk(
  order: GovProcureOrder,
  forecast: ChequeForecast,
  slaThreshold: number,
): boolean {
  if (forecast.expectedIso == null || !order.delivery_date) return false;
  const days = Math.round(
    (new Date(forecast.expectedIso).getTime() - new Date(order.delivery_date).getTime()) /
      86_400_000,
  );
  return days > slaThreshold;
}

export default function ReceivablesPage() {
  const { orders, settings } = useData();

  // simulate initial loading skeleton (§5d)
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(t);
  }, []);

  const [detail, setDetail] = useState<GovProcureOrder | null>(null);
  const [editing, setEditing] = useState<GovProcureOrder | null>(null);
  const [moveStage, setMoveStage] = useState<GovProcureOrder | null>(null);

  const sla = settings.sla_threshold;

  // สรุปเงินค้างรับ (rule ล้วน) — reuse receivableSummary; list เรียง aging มาก→น้อยแล้ว
  const summary = useMemo(
    () => receivableSummary(orders, sla, TODAY_DATE),
    [orders, sla],
  );

  // AI-3 forecast ต่อแถว (คำนวณ median duration ต่อกอง จาก orders ที่ปิดแล้ว)
  const rows = useMemo(
    () =>
      summary.list.map((r) => {
        const forecast = buildForecast(r.order, orders);
        return {
          ...r,
          forecast,
          atRisk: forecastAtRisk(r.order, forecast, sla),
        };
      }),
    [summary.list, orders, sla],
  );

  const hasDelivered = summary.list.length > 0;
  const hasOverdue = summary.overdueCount > 0;

  return (
    <GovProcureShell
      title="เงินค้างรับ / SLA"
      description={`งานที่ส่งของแล้วยังไม่รับเช็ค — เรียงตามจำนวนวันค้างรับ (เกณฑ์เกินกำหนด ${fmtNum(sla)} วัน)`}
      icon={<Wallet className="h-6 w-6" />}
    >
      {/* StatCard สรุป — ยอดค้างรับรวม / จำนวนงานค้าง / จำนวน+ยอด overdue */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="เงินค้างรับรวม"
          value={fmtMoney(summary.totalAmount)}
          sub={`${fmtNum(summary.list.length)} งานส่งของแล้ว รอรับเช็ค`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<PackageOpen className="h-4 w-4" />}
          label="จำนวนงานค้างรับ"
          value={`${fmtNum(summary.list.length)} งาน`}
          sub={`เกินกำหนด ${fmtNum(summary.overdueCount)} งาน`}
          tone="neutral"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label={`เกินกำหนด (> ${fmtNum(sla)} วัน)`}
          value={fmtMoney(summary.overdueAmount)}
          sub={
            hasOverdue
              ? `${fmtNum(summary.overdueCount)} งานต้องเร่งทวง`
              : "ไม่มีงานเกินกำหนด"
          }
          tone={hasOverdue ? "negative" : "positive"}
          valueColored
        />
      </div>

      {loading ? (
        <ReceivablesSkeleton />
      ) : !hasDelivered ? (
        // ไม่มีงาน delivered เลย → state ว่างปกติ (ไม่มีอะไรต้องทวง — ก็ดี)
        <EmptyNoDelivered />
      ) : !hasOverdue ? (
        // มีงานค้างรับแต่ไม่มีเกินกำหนด → good-news + ตารางค้างรับปกติ
        <>
          <GoodNewsBanner
            title="ไม่มีเงินค้างรับเกินกำหนด 🎉"
            detail={`งานที่ส่งของแล้วยังอยู่ในเกณฑ์ ${fmtNum(sla)} วันทั้งหมด — cashflow อยู่ในเกณฑ์ดี`}
          />
          <ReceivablesTable
            rows={rows}
            totalAmount={summary.totalAmount}
            onRow={setDetail}
          />
        </>
      ) : (
        <ReceivablesTable
          rows={rows}
          totalAmount={summary.totalAmount}
          onRow={setDetail}
        />
      )}

      {/* dialogs (reuse foundation) */}
      <DetailDialog
        order={detail}
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
        onEdit={(o) => {
          setDetail(null);
          setEditing(o);
        }}
        onMoveStage={(o) => {
          setDetail(null);
          setMoveStage(o);
        }}
      />
      <OrderDialog
        order={editing}
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
      />
      <StageMoveDialog
        order={moveStage}
        open={moveStage !== null}
        onOpenChange={(v) => !v && setMoveStage(null)}
      />
    </GovProcureShell>
  );
}

// ---- ตารางเงินค้างรับ ----

type ReceivableRow = {
  order: GovProcureOrder;
  agingDays: number;
  overdue: boolean;
  amount: number;
  forecast: ChequeForecast;
  atRisk: boolean;
};

function ReceivablesTable({
  rows,
  totalAmount,
  onRow,
}: {
  rows: ReceivableRow[];
  totalAmount: number;
  onRow: (o: GovProcureOrder) => void;
}) {
  return (
    <>
      <div className="mb-2.5 flex items-center gap-2 px-1 text-sm font-semibold text-gray-900">
        <TrendingUp className="h-4 w-4 text-gray-400" />
        รายการงานค้างรับ (เรียงตามจำนวนวันค้าง)
      </div>
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>หน่วยงาน / กอง</TableHead>
            <TableHead align="center">บริษัท</TableHead>
            <TableHead align="right">ยอดค้างรับ</TableHead>
            <TableHead align="center">วันส่งมอบ</TableHead>
            <TableHead align="center">ค้างรับ</TableHead>
            <TableHead align="center">คาดวันรับเช็ค</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.order.id} clickable onClick={() => onRow(r.order)}>
              <TableCell>
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-900">
                    {r.order.customer_name}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {r.order.department ?? "ไม่ระบุกอง"}
                  </div>
                </div>
              </TableCell>
              <TableCell align="center">
                <CompanyBadge company={r.order.company} />
              </TableCell>
              <TableCell align="right" tabular className="font-medium text-gray-900">
                {fmtMoney(r.amount)}
              </TableCell>
              <TableCell align="center" className="tabular-nums text-gray-600">
                {fmtDateTH(r.order.delivery_date)}
              </TableCell>
              <TableCell align="center">
                {r.overdue ? (
                  <OverdueBadge days={r.agingDays} />
                ) : (
                  <AgingBadge days={r.agingDays} />
                )}
              </TableCell>
              <TableCell align="center">
                <ForecastCell row={r} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="font-medium text-gray-700">
              รวม {fmtNum(rows.length)} งานค้างรับ
            </TableCell>
            <TableCell align="right" tabular className="font-semibold text-gray-900">
              {fmtMoney(totalAmount)}
            </TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableFooter>
      </Table>
    </>
  );
}

/**
 * คอลัมน์ "คาดวันรับเช็ค" (AI-3 rule) — ยุบให้อ่านเร็ว (P1-ux รอบ 1):
 *   บรรทัดหลัก = วันคาด + badge เสี่ยง (เฉพาะ atRisk) · "เฉลี่ย N วัน" ย้ายเป็น title tooltip
 *   ปุ่ม "วิเคราะห์แนวโน้ม AI" แสดงเฉพาะแถว atRisk (ไม่ใช่ทุกแถว) → ลดความสูงแถว
 */
function ForecastCell({ row }: { row: ReceivableRow }) {
  const { forecast, atRisk } = row;
  if (forecast.expectedIso == null) {
    return <span className="text-xs text-gray-400">ประเมินไม่ได้</span>;
  }
  const avgHint =
    forecast.medianDays != null
      ? `เฉลี่ยสัญญา→รับเช็ค ${fmtNum(forecast.medianDays)} วัน${forecast.scope === "portfolio" ? " (ค่ากลางพอร์ต)" : " (กองนี้)"}`
      : undefined;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5" title={avgHint}>
        <CalendarClock className="h-3.5 w-3.5 text-gray-400" />
        <span className="tabular-nums text-sm text-gray-700">
          {fmtDateTH(forecast.expectedIso)}
        </span>
      </div>
      {atRisk && (
        <>
          <StatusBadge tone="warning" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            คาดเกินกำหนด
          </StatusBadge>
          <ForecastAiPopover order={row.order} />
        </>
      )}
    </div>
  );
}

/** ปุ่มเล็ก "วิเคราะห์แนวโน้ม AI" → popover: loading จำลอง → canned narration (AI-3 optional) */
function ForecastAiPopover({ order }: { order: GovProcureOrder }) {
  const canned: GovProcureForecastNarration | undefined = order.department
    ? AI_FORECAST_MOCKS.find((f) => f.department === order.department)
    : undefined;

  // ครอบด้วย span ที่ stopPropagation → กันคลิกทะลุไปเปิด DetailDialog ของ row
  // (Popover wrapper toggle เอง — ปล่อย Button ธรรมดา ไม่ stopPropagation ที่ Button)
  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-block">
      <Popover
        placement="bottom-end"
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-primary hover:text-primary"
          >
            <Sparkles className="mr-1 h-3 w-3" /> วิเคราะห์แนวโน้ม AI
          </Button>
        }
      >
        <ForecastAiPanel canned={canned} department={order.department} />
      </Popover>
    </span>
  );
}

function ForecastAiPanel({
  canned,
  department,
}: {
  canned: GovProcureForecastNarration | undefined;
  department: string | null;
}) {
  const [state, setState] = useState<"loading" | "done">("loading");
  useEffect(() => {
    const t = window.setTimeout(() => setState("done"), 900);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-primary" />
        <Text className="text-sm font-semibold text-gray-900">แนวโน้มการจ่ายของกอง</Text>
      </div>
      {state === "loading" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังวิเคราะห์แนวโน้ม…
          </div>
          <div className="animate-pulse space-y-1.5">
            <div className="h-3 w-full rounded bg-gray-100" />
            <div className="h-3 w-5/6 rounded bg-gray-100" />
          </div>
        </div>
      ) : canned ? (
        <div className="space-y-2">
          <StatusBadge tone="info">มัธยฐาน {fmtNum(canned.median_duration_days)} วัน</StatusBadge>
          <Text className="text-xs leading-relaxed text-gray-600">{canned.narration}</Text>
          <div className="flex items-center gap-1 text-[11px] text-gray-400">
            <ShieldCheck className="h-3 w-3" /> ประเมินจากงานที่ปิดแล้ว — ใช้ประกอบการติดตาม
          </div>
        </div>
      ) : (
        <Text className="text-xs text-gray-500">
          {department
            ? `ยังมีข้อมูลของ "${department}" ไม่พอสรุปแนวโน้มชัดเจน — ใช้ค่ากลางพอร์ตประกอบแทน`
            : "งานนี้ยังไม่ระบุกอง จึงประเมินแนวโน้มเฉพาะกองไม่ได้"}
        </Text>
      )}
    </div>
  );
}

// ---- states (§5d) ----

/** good-news banner (tone บวก — Receivables empty ข้อยกเว้น §5d) */
function GoodNewsBanner({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
        <CheckCircle2 className="h-5 w-5" />
      </span>
      <div>
        <Text className="text-sm font-semibold text-green-800">{title}</Text>
        <Text className="mt-0.5 text-sm text-green-700">{detail}</Text>
      </div>
    </div>
  );
}

/** ไม่มีงาน delivered เลย = good-news แบบเต็มการ์ด (ไม่มีอะไรต้องทวง = ดี — ไม่ใช่ empty เศร้า) */
function EmptyNoDelivered() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-green-200 bg-green-50/60 py-16 text-center">
      <div className="mb-4 rounded-full bg-green-100 p-4">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <Text className="text-sm font-semibold text-green-800">
        ไม่มีเงินค้างรับเกินกำหนด 🎉
      </Text>
      <Text className="mt-1 max-w-sm text-sm text-green-700">
        ตอนนี้ไม่มีงานที่ส่งของแล้วรอรับเช็ค — เมื่อมีงานถึงสถานะ &ldquo;ส่งสินค้าแล้ว รอรับเช็ค&rdquo;
        จะแสดงที่นี่พร้อมจำนวนวันค้างรับ
      </Text>
    </div>
  );
}

/** loading skeleton — StatCard + table (ห้าม spinner กลางจอ §9) */
function ReceivablesSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-6">
      <div className="h-4 w-40 rounded bg-gray-100" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-gray-50" />
        ))}
      </div>
    </div>
  );
}
