"use client";

// _receivables-client.tsx — เงินค้างรับ / SLA / aging (spec §5 #5)
// เฉพาะงาน stage=delivered เรียง aging มาก→น้อย · StatCard สรุป · Table primitives
// คาดวันรับเช็ค (rule: median duration ต่อกอง + delivery_date) + badge เสี่ยงถ้าคาดเกิน SLA
// popover "ที่มาการคาดการณ์" = rule-derived (คำนวณจากงานที่ปิดแล้ว — ไม่ใช่ AI, ไม่ยิง API)
// empty = GOOD-NEWS (tone บวก) ถ้าไม่มี overdue · ห้ามปุ่ม refresh

import { useMemo, useState } from "react";
import { Wallet, CheckCircle2, CalendarClock, AlertTriangle, TrendingUp, Info } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
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
} from "@/components/ui/table";
import { computeDuration, isRealized } from "@/lib/gov-procure/summary";
import type { GovProcureOrder, GovProcureSettings, GovProcureRole } from "@/lib/gov-procure/types";
import {
  GovProcureProvider,
  useData,
  fmtMoney,
  fmtNum,
  fmtDateTH,
  receivableSummary,
  TODAY_DATE,
} from "../_components";
import { OverdueBadge, AgingBadge, CompanyBadge } from "../_components/badges";
import { DetailDialog } from "../_components/detail-dialog";
import { OrderDialog } from "../_components/order-dialog";
import { StageMoveDialog } from "../_components/stage-move-dialog";

// ── AI-3 (rule-only) — คาดวันรับเช็ค = delivery_date + median(duration ต่อกอง จากงานที่ปิดแล้ว) ──
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

interface ChequeForecast {
  medianDays: number | null;
  scope: "dept" | "portfolio" | "none";
  expectedIso: string | null;
}

function buildForecast(order: GovProcureOrder, orders: GovProcureOrder[]): ChequeForecast {
  const closedDurations: { dept: string | null; days: number }[] = [];
  for (const o of orders) {
    if (!isRealized(o)) continue;
    const d = computeDuration(o);
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
    const baseTime = new Date(order.delivery_date).getTime();
    expectedIso = new Date(baseTime + chosen * 86_400_000).toISOString().slice(0, 10);
  }
  return { medianDays: chosen, scope, expectedIso };
}

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

export function ReceivablesClient({
  orders,
  settings,
  orgId,
  orgSlug,
  role,
}: {
  orders: GovProcureOrder[];
  settings: GovProcureSettings;
  orgId: string;
  orgSlug: string;
  role: GovProcureRole;
}) {
  return (
    <GovProcureProvider
      orgId={orgId}
      orgSlug={orgSlug}
      role={role}
      initialOrders={orders}
      initialSettings={settings}
    >
      <ReceivablesBody />
    </GovProcureProvider>
  );
}

function ReceivablesBody() {
  const { orders, settings } = useData();
  const sla = settings.sla_threshold;

  const [detail, setDetail] = useState<GovProcureOrder | null>(null);
  const [editing, setEditing] = useState<GovProcureOrder | null>(null);
  const [moveStage, setMoveStage] = useState<GovProcureOrder | null>(null);

  const summary = useMemo(() => receivableSummary(orders, sla, TODAY_DATE), [orders, sla]);

  const rows = useMemo(
    () =>
      summary.list.map((r) => {
        const forecast = buildForecast(r.order, orders);
        return { ...r, forecast, atRisk: forecastAtRisk(r.order, forecast, sla) };
      }),
    [summary.list, orders, sla],
  );

  const hasDelivered = summary.list.length > 0;
  const hasOverdue = summary.overdueCount > 0;

  return (
    <PageShell
      width="full"
      icon={<Wallet className="h-6 w-6" />}
      title="เงินค้างรับ / SLA"
      description={`งานที่ส่งของแล้วยังไม่รับเช็ค — เรียงตามจำนวนวันค้างรับ (เกณฑ์เกินกำหนด ${fmtNum(sla)} วัน)`}
    >
      <div className="space-y-5">
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
            icon={<CalendarClock className="h-4 w-4" />}
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
              hasOverdue ? `${fmtNum(summary.overdueCount)} งานต้องเร่งทวง` : "ไม่มีงานเกินกำหนด"
            }
            tone={hasOverdue ? "negative" : "positive"}
            valueColored
          />
        </div>

        {!hasDelivered ? (
          <EmptyNoDelivered />
        ) : !hasOverdue ? (
          <>
            <GoodNewsBanner
              title="ไม่มีเงินค้างรับเกินกำหนด"
              detail={`งานที่ส่งของแล้วยังอยู่ในเกณฑ์ ${fmtNum(sla)} วันทั้งหมด — cashflow อยู่ในเกณฑ์ดี`}
            />
            <ReceivablesTable rows={rows} totalAmount={summary.totalAmount} onRow={setDetail} />
          </>
        ) : (
          <ReceivablesTable rows={rows} totalAmount={summary.totalAmount} onRow={setDetail} />
        )}

        {/* dialogs */}
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
      </div>
    </PageShell>
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
                  <div className="truncate font-medium text-gray-900">{r.order.customer_name}</div>
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
          <ForecastSourcePopover forecast={forecast} department={row.order.department} />
        </>
      )}
    </div>
  );
}

/** popover "ที่มาการคาดการณ์" — rule-derived (median duration งานที่ปิดแล้ว), ไม่ใช่ AI ไม่ยิง API */
function ForecastSourcePopover({
  forecast,
  department,
}: {
  forecast: ChequeForecast;
  department: string | null;
}) {
  const scopeText =
    forecast.scope === "dept" ? `กอง${department ?? ""}`.trim() : "ค่ากลางทั้งพอร์ต";
  const narration =
    forecast.medianDays != null
      ? `${scopeText}ใช้เวลาสัญญา → รับเช็คเฉลี่ย ${fmtNum(forecast.medianDays)} วัน (คำนวณจากงานที่ปิดแล้ว) — ใช้ประกอบการติดตาม`
      : department
        ? `ยังมีข้อมูลของ "${department}" ไม่พอสรุปแนวโน้ม จึงใช้ค่ากลางพอร์ตประกอบแทน`
        : "งานนี้ยังไม่ระบุกอง จึงประเมินแนวโน้มเฉพาะกองไม่ได้";

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
            <Info className="mr-1 h-3 w-3" /> ที่มาการคาดการณ์
          </Button>
        }
      >
        <div className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" />
            <Text className="text-sm font-semibold text-gray-900">แนวโน้มการจ่ายของกอง</Text>
          </div>
          {forecast.medianDays != null && (
            <StatusBadge tone="info">มัธยฐาน {fmtNum(forecast.medianDays)} วัน</StatusBadge>
          )}
          <Text className="mt-2 text-xs leading-relaxed text-gray-600">{narration}</Text>
        </div>
      </Popover>
    </span>
  );
}

// ---- states (§5d) ----

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

function EmptyNoDelivered() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-green-200 bg-green-50/60 py-16 text-center">
      <div className="mb-4 rounded-full bg-green-100 p-4">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <Text className="text-sm font-semibold text-green-800">ไม่มีเงินค้างรับเกินกำหนด</Text>
      <Text className="mt-1 max-w-sm text-sm text-green-700">
        ตอนนี้ไม่มีงานที่ส่งของแล้วรอรับเช็ค — เมื่อมีงานถึงสถานะ &ldquo;ส่งสินค้าแล้ว
        รอรับเช็ค&rdquo; จะแสดงที่นี่พร้อมจำนวนวันค้างรับ
      </Text>
    </div>
  );
}
