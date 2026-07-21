"use client";

// reports/page.tsx — รายงานรายได้ — 2 tab: รายงาน (รายได้/occupancy/ADR/RevPAR + AI H1) · แจ้งเตือน LINE (L1 config + Flex preview)
// gate §4.1: reports — owner/manager/viewer (V) · housekeeper (none)

import { useMemo, useState } from "react";
import { BarChart3, TrendingUp, Percent, Landmark, Gauge, Bell, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
  TableEmpty,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
  HotelShell,
  useHotelRole,
  useHotelData,
  fmtMoney,
  fmtNum,
  SOURCE_LABEL,
  ROOM_TYPE_LABEL,
  computeBalance,
  paymentsOf,
  AiSummaryBox,
  NoAccess,
} from "../_components";
import {
  aiSummaryToday,
  aiSummaryMonthJun,
  defaultLineNotifyConfig,
  type LineNotifyConfig,
} from "../_fixtures";
import { L1FlexPreview } from "./flex-preview";
import type { BookingSource, RoomType } from "../_fixtures/types";

const TODAY = "2026-06-23";
const MONTH_START = "2026-06-01";

export default function ReportsPage() {
  const { can } = useHotelRole();
  const canView = can("view", "reports");

  const { rooms, bookings, payments } = useHotelData();

  const [tab, setTab] = useState<"report" | "line">("report");
  const [fromDate, setFromDate] = useState(MONTH_START);
  const [toDate, setToDate] = useState(TODAY);

  // LINE config (mock — client state)
  const [lineCfg, setLineCfg] = useState<LineNotifyConfig>(defaultLineNotifyConfig);

  // ── รายงานในช่วงที่เลือก (คำนวณจาก fixture จริง) ──
  const report = useMemo(() => {
    const inRange = (iso: string) => {
      const day = iso.slice(0, 10);
      return day >= fromDate && day <= toDate;
    };

    // รายได้ในช่วง (เงินเข้า − refund) ตาม paid_at
    const revenue = payments
      .filter((p) => inRange(p.paid_at))
      .reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);

    // รายได้ตาม source / room type — แอตทริบิวต์ตาม booking ของแต่ละ payment
    const bySource = new Map<BookingSource, number>();
    const byType = new Map<RoomType, number>();
    for (const p of payments) {
      if (!inRange(p.paid_at)) continue;
      const amt = p.kind === "refund" ? -p.amount : p.amount;
      const b = bookings.find((x) => x.id === p.booking_id);
      if (!b) continue;
      bySource.set(b.source, (bySource.get(b.source) ?? 0) + amt);
      const room = rooms.find((r) => r.id === b.room_id);
      if (room) byType.set(room.room_type, (byType.get(room.room_type) ?? 0) + amt);
    }
    const sourceRows = Array.from(bySource.entries())
      .map(([source, amount]) => ({ source, amount }))
      .sort((a, b) => b.amount - a.amount);
    const typeRows = Array.from(byType.entries())
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount);

    // occupancy / ADR / RevPAR — ห้องขายได้
    const sellable = rooms.filter(
      (r) => r.status !== "maintenance" && r.status !== "out_of_service",
    ).length;
    const occupiedRooms = rooms.filter(
      (r) => r.status === "occupied" || r.status === "reserved",
    ).length;
    const occupancy = sellable > 0 ? Math.round((occupiedRooms / sellable) * 100) : 0;

    // ADR = รายได้ค่าห้องในช่วง / จำนวนคืนที่ขายได้ (จาก bookings ที่ check_in ในช่วง)
    const staysInRange = bookings.filter(
      (b) =>
        b.status !== "cancelled" &&
        b.status !== "no_show" &&
        b.check_in_date >= fromDate &&
        b.check_in_date <= toDate,
    );
    const roomNights = staysInRange.reduce(
      (s, b) => s + (b.stay_type === "hourly" ? 1 : (b.nights ?? 1)),
      0,
    );
    const roomRevenue = staysInRange.reduce((s, b) => s + b.room_total, 0);
    const adr = roomNights > 0 ? Math.round(roomRevenue / roomNights) : 0;
    const revpar = Math.round(adr * (occupancy / 100));

    // ค้างชำระรวม (ทั้งระบบ — สถานะ active)
    let outstanding = 0;
    let outstandingCount = 0;
    for (const b of bookings) {
      if (b.status === "cancelled" || b.status === "no_show") continue;
      const bal = computeBalance(b, paymentsOf(b.id, payments));
      if (bal > 0) {
        outstanding += bal;
        outstandingCount += 1;
      }
    }

    return {
      revenue,
      sourceRows,
      typeRows,
      occupancy,
      adr,
      revpar,
      outstanding,
      outstandingCount,
      isMonth: fromDate <= MONTH_START && toDate >= TODAY,
    };
  }, [rooms, bookings, payments, fromDate, toDate]);

  // เลือก AI mock ตาม scope (รายเดือน vs รายวัน)
  const aiData = report.isMonth ? aiSummaryMonthJun : aiSummaryToday;
  const periodLabel = report.isMonth ? "มิถุนายน 2569 (ถึงปัจจุบัน)" : "ตามช่วงเวลาที่เลือก";

  if (!canView)
    return (
      <NoAccess title="รายงานรายได้" icon={<BarChart3 className="h-6 w-6" />}>
        บทบาทแม่บ้านไม่สามารถดูรายงานรายได้ได้ — ลองสลับเป็นผู้จัดการ/เจ้าของ
      </NoAccess>
    );

  const tabs = (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
      <Button
        size="sm"
        variant={tab === "report" ? "secondary" : "ghost"}
        onClick={() => setTab("report")}
      >
        <BarChart3 className="mr-1.5 h-4 w-4" /> รายงาน
      </Button>
      <Button
        size="sm"
        variant={tab === "line" ? "secondary" : "ghost"}
        onClick={() => setTab("line")}
      >
        <Bell className="mr-1.5 h-4 w-4" /> แจ้งเตือน LINE
      </Button>
    </div>
  );

  return (
    <HotelShell
      title="รายงานรายได้"
      description="สรุปรายได้ occupancy ADR/RevPAR ตามช่วงเวลา + สรุปด้วย AI และตั้งค่าแจ้งเตือน LINE"
      icon={<BarChart3 className="h-6 w-6" />}
      tabs={tabs}
    >
      {tab === "report" ? (
        <>
          {/* ช่วงเวลา */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>ตั้งแต่วันที่</Label>
                <ThaiDatePicker value={fromDate} onChange={setFromDate} placeholder="เลือกวันที่" />
              </div>
              <div>
                <Label>ถึงวันที่</Label>
                <ThaiDatePicker value={toDate} onChange={setToDate} placeholder="เลือกวันที่" />
              </div>
              <div className="flex items-end gap-2 sm:col-span-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFromDate(TODAY);
                    setToDate(TODAY);
                  }}
                >
                  วันนี้
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFromDate(MONTH_START);
                    setToDate(TODAY);
                  }}
                >
                  เดือนนี้
                </Button>
              </div>
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="รายได้ในช่วง"
              value={fmtMoney(report.revenue)}
              tone="positive"
              valueColored
            />
            <StatCard
              icon={<Percent className="h-4 w-4" />}
              label="อัตราเข้าพัก (วันนี้)"
              value={`${report.occupancy}%`}
              tone="info"
              valueColored
            />
            <StatCard
              icon={<Gauge className="h-4 w-4" />}
              label="ADR (รายได้/คืน)"
              value={fmtMoney(report.adr)}
              sub="Average Daily Rate"
              tone="primary"
            />
            <StatCard
              icon={<Landmark className="h-4 w-4" />}
              label="RevPAR"
              value={fmtMoney(report.revpar)}
              sub="รายได้ต่อห้องที่ขายได้"
              tone="primary"
            />
          </div>

          {/* AI summary (Mock H1) */}
          <AiSummaryBox data={aiData} periodLabel={periodLabel} />

          {/* รายได้ตาม source / ประเภทห้อง */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="min-w-0">
              <Text className="mb-2 text-sm font-semibold text-gray-900">รายได้ตามช่องทาง</Text>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ช่องทาง</TableHead>
                    <TableHead align="right">รายได้</TableHead>
                    <TableHead align="right">สัดส่วน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.sourceRows.length === 0 ? (
                    <TableEmpty colSpan={3}>ไม่มีรายได้ในช่วงนี้</TableEmpty>
                  ) : (
                    report.sourceRows.map((r) => (
                      <TableRow key={r.source}>
                        <TableCell>{SOURCE_LABEL[r.source]}</TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(r.amount)}
                        </TableCell>
                        <TableCell align="right" tabular className="text-gray-500">
                          {report.revenue > 0
                            ? `${Math.round((r.amount / report.revenue) * 100)}%`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {report.sourceRows.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold text-gray-900">รวม</TableCell>
                      <TableCell align="right" tabular className="font-semibold text-gray-900">
                        {fmtMoney(report.revenue)}
                      </TableCell>
                      <TableCell align="right" className="text-gray-500">
                        100%
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            <div className="min-w-0">
              <Text className="mb-2 text-sm font-semibold text-gray-900">
                รายได้ตามประเภทห้อง A/V/C
              </Text>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ประเภทห้อง</TableHead>
                    <TableHead align="right">รายได้</TableHead>
                    <TableHead align="right">สัดส่วน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.typeRows.length === 0 ? (
                    <TableEmpty colSpan={3}>ไม่มีรายได้ในช่วงนี้</TableEmpty>
                  ) : (
                    report.typeRows.map((r) => (
                      <TableRow key={r.type}>
                        <TableCell>{ROOM_TYPE_LABEL[r.type]}</TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(r.amount)}
                        </TableCell>
                        <TableCell align="right" tabular className="text-gray-500">
                          {report.revenue > 0
                            ? `${Math.round((r.amount / report.revenue) * 100)}%`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            ค้างชำระคงเหลือทั้งระบบ:{" "}
            <span className="font-mono font-semibold tabular-nums text-red-600">
              {fmtMoney(report.outstanding)}
            </span>{" "}
            ({fmtNum(report.outstandingCount)} การจอง)
          </div>
        </>
      ) : (
        /* ── tab: แจ้งเตือน LINE (L1) ── */
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* การตั้งค่า */}
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <div>
                  <Text className="text-sm font-semibold text-gray-900">
                    รายงานรายได้รายวัน (LINE)
                  </Text>
                  <Text className="text-xs text-gray-500">
                    ส่งสรุปรายได้ + occupancy + ค้างชำระ เข้า LINE ทุกเย็น
                  </Text>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {/* เปิด/ปิด */}
                <ToggleRow
                  label="เปิดการแจ้งเตือนรายงานรายได้รายวัน"
                  desc={lineCfg.enabled ? `ส่งทุกวันเวลา ${lineCfg.send_time} น.` : "ปิดอยู่"}
                  on={lineCfg.enabled}
                  onToggle={() => {
                    setLineCfg((c) => ({ ...c, enabled: !c.enabled }));
                    toast.success(lineCfg.enabled ? "ปิดการแจ้งเตือนแล้ว" : "เปิดการแจ้งเตือนแล้ว");
                  }}
                />

                {/* ผู้รับ */}
                <div>
                  <Label>ผู้รับการแจ้งเตือน</Label>
                  <div className="mt-1 space-y-2">
                    <ToggleRow
                      label="เจ้าของ (owner)"
                      on={lineCfg.recipients.owner}
                      disabled={!lineCfg.enabled}
                      onToggle={() =>
                        setLineCfg((c) => ({
                          ...c,
                          recipients: { ...c.recipients, owner: !c.recipients.owner },
                        }))
                      }
                    />
                    <ToggleRow
                      label="ผู้จัดการ (manager)"
                      on={lineCfg.recipients.manager}
                      disabled={!lineCfg.enabled}
                      onToggle={() =>
                        setLineCfg((c) => ({
                          ...c,
                          recipients: { ...c.recipients, manager: !c.recipients.manager },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  ตัวอย่างนี้เป็น mock — production จะส่งจริงผ่าน Cloud Scheduler (cron เย็น)
                </div>
              </div>
            </div>
          </div>

          {/* Flex preview */}
          <div>
            <Text className="mb-3 text-sm font-semibold text-gray-900">
              ตัวอย่างการ์ดที่จะส่งใน LINE
            </Text>
            <div className="flex justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
              <L1FlexPreview />
            </div>
            <Text className="mt-2 text-center text-xs text-gray-400">
              ภาพจำลอง LINE Flex Message · header CHARCOAL ตามคู่มือการ์ด
            </Text>
          </div>
        </div>
      )}
    </HotelShell>
  );
}

function ToggleRow({
  label,
  desc,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  desc?: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
      <div>
        <Text className="text-sm text-gray-900">{label}</Text>
        {desc && <Text className="text-xs text-gray-400">{desc}</Text>}
      </div>
      <div className="flex items-center gap-2">
        {on && !disabled && <StatusBadge tone="success">เปิด</StatusBadge>}
        <Button
          size="sm"
          variant={on ? "secondary" : "outline"}
          disabled={disabled}
          onClick={onToggle}
        >
          {on ? "ปิด" : "เปิด"}
        </Button>
      </div>
    </div>
  );
}
