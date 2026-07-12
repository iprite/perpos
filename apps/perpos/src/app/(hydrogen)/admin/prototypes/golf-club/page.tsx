"use client";

// page.tsx — แดชบอร์ด (ภาพรวมวันนี้) — P4a pattern page
// (1) KPI วันนี้ (จอง / utilization / รายได้ / no-show) คำนวณสด · (2) คิววันนี้ ต้องเช็คอิน
// (3) mini peak bands + alert no-show เสี่ยง · (4) AI-1 brief (mock loading → canned)

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarClock,
  Percent,
  Banknote,
  UserX,
  ArrowRight,
  Sparkles,
  Loader2,
  Lightbulb,
  ListChecks,
  AlertTriangle,
  Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import cn from "@core/utils/class-names";
import {
  GolfShell,
  useGolfBase,
  useGolfData,
  bookerName,
  formatAmount,
  fmtNum,
  dowTH,
  TODAY_ISO,
  buildTeeSlots,
  computeBands,
  computeUtilization,
  BookingStatusBadge,
} from "./_components";
import { golfBriefToday, golfBriefWeek, type GolfOccupancyBrief } from "./_fixtures/ai-mocks";
import { BookingDetailDialog } from "./_components/booking-detail-dialog";
import type { GolfBooking } from "./_fixtures/types";

export default function GolfDashboardPage() {
  const router = useRouter();
  const BASE = useGolfBase();
  const { bookings, members, resources } = useGolfData();
  const [detailBooking, setDetailBooking] = useState<GolfBooking | null>(null);

  const course = useMemo(() => resources.find((r) => r.resource_type === "course"), [resources]);

  // ── derived วันนี้ (สด) ──
  const stat = useMemo(() => {
    const today = bookings.filter((b) => b.booking_date === TODAY_ISO && b.status !== "cancelled");
    const tee = today.filter((b) => b.booking_type === "tee_time");
    const range = today.filter((b) => b.booking_type === "driving_range");
    const revenue = today.reduce((s, b) => s + (b.total_amount ?? 0), 0);
    const noShow = bookings.filter(
      (b) => b.booking_date === TODAY_ISO && b.status === "no_show",
    ).length;
    const slots = course ? buildTeeSlots(course, bookings, TODAY_ISO) : [];
    const util = computeUtilization(slots);
    const bands = computeBands(slots);
    return {
      total: today.length,
      tee: tee.length,
      range: range.length,
      revenue,
      noShow,
      util,
      bands,
    };
  }, [bookings, course]);

  // คิววันนี้ที่ยืนยันแล้ว รอเช็คอิน (เรียงตามเวลา)
  const queue = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.booking_date === TODAY_ISO && (b.status === "confirmed" || b.status === "pending"),
        )
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [bookings],
  );

  // จอง LINE รอชำระมัดจำ = เสี่ยง no-show (rule detect, ไม่เรียก AI)
  const riskPending = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.booking_date === TODAY_ISO &&
          b.channel === "line" &&
          b.status === "pending" &&
          b.payment_status === "unpaid",
      ),
    [bookings],
  );

  const resourceName = (id: string) => resources.find((r) => r.id === id)?.name ?? "—";

  return (
    <GolfShell
      title="แดชบอร์ด"
      description={`ภาพรวมสนามวันนี้ · ${dowTH(TODAY_ISO)} 12 ก.ค. 2569`}
      icon={<LayoutDashboard className="h-6 w-6" />}
      actions={
        <Button variant="outline" onClick={() => router.push(`${BASE}/tee-times`)}>
          เปิดตารางจอง
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      }
    >
      {/* (1) KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="จองวันนี้"
          value={fmtNum(stat.total)}
          sub={`สนาม ${stat.tee} · ไดร์ฟ ${stat.range}`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<Percent className="h-4 w-4" />}
          label="ใช้สนามวันนี้ (utilization)"
          value={`${stat.util.pct}%`}
          sub={`จอง ${stat.util.booked}/${stat.util.total} ช่อง`}
          tone="primary"
          valueColored
        />
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="รายได้วันนี้"
          value={formatAmount(stat.revenue)}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<UserX className="h-4 w-4" />}
          label="ไม่มาตามนัด (no-show) วันนี้"
          value={fmtNum(stat.noShow)}
          sub={stat.noShow > 0 ? "เสียช่องพีค — พิจารณาขอมัดจำ" : "ยังไม่มี no-show"}
          tone={stat.noShow > 0 ? "negative" : "positive"}
          valueColored
        />
      </div>

      {/* (4) AI-1 brief */}
      <AiBriefCard />

      {/* alert no-show เสี่ยง */}
      {riskPending.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <span className="font-medium">จอง LINE รอชำระมัดจำ {riskPending.length} ราย</span> —
            ยังไม่ยืนยัน/ไม่ชำระ เสี่ยงหลุดช่องพีค แนะนำติดตามให้ยืนยันหรือขอมัดจำก่อน
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* (2) คิววันนี้ ต้องเช็คอิน */}
        <div className="lg:col-span-2">
          <div className="mb-2.5 flex items-center gap-2 px-1">
            <ListChecks className="h-4 w-4 text-primary" />
            <Text className="text-sm font-semibold text-gray-900">คิววันนี้ · รอเช็คอิน</Text>
            <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {queue.length} คิว
            </span>
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>เวลา</TableHead>
                <TableHead>ผู้จอง</TableHead>
                <TableHead>ทรัพยากร</TableHead>
                <TableHead align="center">จำนวน</TableHead>
                <TableHead align="center">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.length === 0 ? (
                <TableEmpty colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-6">
                    <Flag className="h-7 w-7 text-gray-300" />
                    <span>ยังไม่มีคิวที่ต้องเช็คอินวันนี้</span>
                    <Button size="sm" onClick={() => router.push(`${BASE}/tee-times`)}>
                      เปิดตารางจอง
                    </Button>
                  </div>
                </TableEmpty>
              ) : (
                queue.slice(0, 12).map((b) => (
                  <TableRow key={b.id} clickable onClick={() => setDetailBooking(b)}>
                    <TableCell className="font-medium text-gray-900 tabular-nums">
                      {b.start_time}
                    </TableCell>
                    <TableCell>{bookerName(b, members)}</TableCell>
                    <TableCell className="text-gray-500">{resourceName(b.resource_id)}</TableCell>
                    <TableCell align="center" className="tabular-nums">
                      {partySummary(b)}
                    </TableCell>
                    <TableCell align="center">
                      <BookingStatusBadge status={b.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* (3) mini peak bands */}
        <div>
          <div className="mb-2.5 flex items-center gap-2 px-1">
            <Percent className="h-4 w-4 text-primary" />
            <Text className="text-sm font-semibold text-gray-900">ช่วงพีควันนี้ (สนาม)</Text>
          </div>
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            {stat.bands.map((band) => (
              <div key={band.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-gray-600">{band.label}</span>
                  <span className="tabular-nums text-gray-500">
                    {band.booked}/{band.slots} · {band.util_pct}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      band.util_pct >= 70 ? "bg-primary" : "bg-gray-300",
                    )}
                    style={{ width: `${band.util_pct}%` }}
                  />
                </div>
              </div>
            ))}
            <Text className="pt-1 text-[11px] text-gray-400">
              ช่วงว่างมาก = โอกาสจัดโปรฯ เติมช่อง (เช่น Twilight บ่าย)
            </Text>
          </div>
        </div>
      </div>

      <BookingDetailDialog
        booking={detailBooking}
        open={!!detailBooking}
        onOpenChange={(v) => !v && setDetailBooking(null)}
      />
    </GolfShell>
  );
}

/** สรุปจำนวนต่อ booking — สนาม = N คน · ไดร์ฟ = N ตะกร้า */
function partySummary(b: GolfBooking): string {
  if (b.booking_type === "driving_range") return `${b.bucket_qty ?? 1} ตะกร้า`;
  return `${b.party_size} คน`;
}

// ==================== AI-1 Occupancy Brief (Mock) ====================
function AiBriefCard() {
  const [scope, setScope] = useState<"day" | "week">("day");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GolfOccupancyBrief | null>(null);

  function run() {
    setLoading(true);
    setResult(null);
    // จำลอง latency ของ AI (~1.2 วิ)
    setTimeout(() => {
      setResult(scope === "day" ? golfBriefToday : golfBriefWeek);
      setLoading(false);
    }, 1200);
  }

  function changeScope(v: "day" | "week") {
    setScope(v);
    setResult(null);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <Text className="text-sm font-semibold text-gray-900">สรุปการใช้สนามด้วย AI</Text>
            <Text className="text-xs text-gray-500">
              วิเคราะห์ utilization/ช่วงพีค แล้วแนะกลยุทธ์เติมช่องว่าง
            </Text>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            value={scope}
            onChange={changeScope}
            size="sm"
            options={[
              { value: "day", label: "วันนี้" },
              { value: "week", label: "สัปดาห์นี้" },
            ]}
          />
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                กำลังวิเคราะห์…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" />
                สรุปด้วย AI
              </>
            )}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="mt-4 animate-pulse space-y-2">
          <div className="h-4 w-3/4 rounded bg-gray-100" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-2/3 rounded bg-gray-100" />
        </div>
      )}

      {result && !loading && (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed text-gray-700">{result.output.narration}</p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <ListChecks className="h-3.5 w-3.5" />
                ประเด็นสำคัญ
              </div>
              <ul className="space-y-1.5">
                {result.output.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-600">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                <Lightbulb className="h-3.5 w-3.5" />
                คำแนะนำ
              </div>
              <ul className="space-y-1.5">
                {result.output.recommend.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs text-blue-800">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Text className="text-[11px] text-gray-400">
            ความเชื่อมั่น {Math.round(result.output.confidence * 100)}% · AI สรุปจากตัวเลขที่ระบบคำนวณ
            (ตรวจทานก่อนตัดสินใจ)
          </Text>
        </div>
      )}
    </div>
  );
}
