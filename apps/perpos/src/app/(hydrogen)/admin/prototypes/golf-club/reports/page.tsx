"use client";

// reports/page.tsx — รายงาน (P4b Group C) — วิเคราะห์ย้อนหลัง + export (ไม่ใช่ action-now)
// SegmentedControl toggle: รายได้ / utilization / no-show / สมาชิกภาพ — คำนวณสดจาก fixture
// AI-3 teaser (Dynamic Pricing, beta, read-only) · export CSV (mock) · staff → สรุปพื้นฐาน + banner

import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Banknote,
  TrendingUp,
  Target,
  Percent,
  UserX,
  BadgeCheck,
  Sparkles,
  Loader2,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
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
import { notify } from "@/lib/toast";
import {
  GolfShell,
  AccessLockBanner,
  useGolfRole,
  useGolfData,
  formatAmount,
  fmtNum,
  fmtDateTH,
  dowTH,
  TODAY_ISO,
  computeBands,
  computeUtilization,
  buildTeeSlots,
  CHANNEL_LABEL,
  MEMBER_TYPE_LABEL,
  TIER_LABEL,
} from "../_components";
import { golfPricingSuggestion } from "../_fixtures/ai-mocks";
import type {
  GolfBooking,
  GolfMember,
  GolfPriceCategory,
  GolfBookingChannel,
} from "../_fixtures/types";

type ReportTab = "revenue" | "utilization" | "noshow" | "membership";

const CATEGORY_LABEL: Record<GolfPriceCategory, string> = {
  green_fee: "กรีนฟี",
  caddie: "แคดดี้",
  cart: "รถกอล์ฟ",
  range_bucket: "ตะกร้าลูก (ไดร์ฟ)",
  other: "อื่น ๆ",
};

interface RevAgg {
  total: number;
  tee: number;
  range: number;
  count: number;
  byChannel: [GolfBookingChannel, { count: number; amount: number }][];
  byCategory: [GolfPriceCategory, number][];
  byDay: [string, number][];
}
interface UtilAgg {
  bands: { label: string; slots: number; booked: number; util_pct: number }[];
  courseUtil: { booked: number; total: number; pct: number };
  rangePct: number;
  activeBays: number;
  bookedBays: number;
  peak?: { label: string; util_pct: number };
  quiet?: { label: string; util_pct: number };
}
interface NsAgg {
  noShow: number;
  completed: number;
  rate: number;
  loss: number;
  offenders: GolfMember[];
}
interface MemAgg {
  activeCount: number;
  recurring: number;
  tierCount: Record<string, number>;
  seg: Record<string, number>;
  byPlan: { name: string; tier: GolfMember["tier"]; count: number; price: number }[];
}

/** ดาวน์โหลด CSV (mock — client-side blob) */
function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function GolfReportsPage() {
  const { role } = useGolfRole();
  const { bookings, members, plans, resources } = useGolfData();
  const [tab, setTab] = useState<ReportTab>("revenue");

  const restricted = role === "staff"; // staff = สรุปพื้นฐาน + banner เชิงลึก
  const canRunAi = role === "owner" || role === "manager";

  const course = useMemo(() => resources.find((r) => r.resource_type === "course"), [resources]);
  const memberById = useMemo(() => {
    const map = new Map<string, GolfMember>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  // ── revenue aggregates (source-of-truth = Σ total_amount, status ≠ cancelled) ──
  const rev = useMemo<RevAgg>(() => {
    const active = bookings.filter((b) => b.status !== "cancelled");
    const total = active.reduce((s, b) => s + (b.total_amount ?? 0), 0);
    const tee = active.filter((b) => b.booking_type === "tee_time").reduce((s, b) => s + (b.total_amount ?? 0), 0);
    const range = active.filter((b) => b.booking_type === "driving_range").reduce((s, b) => s + (b.total_amount ?? 0), 0);

    const byChannel = new Map<GolfBookingChannel, { count: number; amount: number }>();
    active.forEach((b) => {
      const c = byChannel.get(b.channel) ?? { count: 0, amount: 0 };
      c.count += 1;
      c.amount += b.total_amount ?? 0;
      byChannel.set(b.channel, c);
    });

    const byCategory = new Map<GolfPriceCategory, number>();
    active.forEach((b) =>
      b.items.forEach((it) => byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + it.line_total)),
    );

    const byDay = new Map<string, number>();
    active.forEach((b) => byDay.set(b.booking_date, (byDay.get(b.booking_date) ?? 0) + (b.total_amount ?? 0)));

    return {
      total,
      tee,
      range,
      count: active.length,
      byChannel: Array.from(byChannel.entries()).sort((a, b) => b[1].amount - a[1].amount),
      byCategory: Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]),
      byDay: Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [bookings]);

  // ── membership recurring revenue + tier/segment ──
  const mem = useMemo<MemAgg>(() => {
    const activeMembers = members.filter((m) => m.membership_plan_id);
    const recurring = activeMembers.reduce((s, m) => {
      const p = plans.find((x) => x.id === m.membership_plan_id);
      return s + (p?.price_per_year ?? 0);
    }, 0);
    const tierCount = { silver: 0, gold: 0, platinum: 0, none: 0 } as Record<string, number>;
    members.forEach((m) => (tierCount[m.tier] = (tierCount[m.tier] ?? 0) + 1));

    // booking revenue split by member type (walk-in/ไม่มี member = guest)
    const seg = { member: 0, vip: 0, guest: 0 } as Record<string, number>;
    bookings
      .filter((b) => b.status !== "cancelled")
      .forEach((b) => {
        const t = b.member_id ? (memberById.get(b.member_id)?.member_type ?? "guest") : "guest";
        seg[t] = (seg[t] ?? 0) + (b.total_amount ?? 0);
      });

    const byPlan = plans.map((p) => ({
      name: p.name,
      tier: p.tier,
      count: members.filter((m) => m.membership_plan_id === p.id).length,
      price: p.price_per_year,
    }));

    return { activeCount: activeMembers.length, recurring, tierCount, seg, byPlan };
  }, [members, plans, bookings, memberById]);

  // ── utilization (อ้างอิงวันพีค TODAY_ISO) ──
  const util = useMemo<UtilAgg>(() => {
    const bands = course ? computeBands(buildTeeSlots(course, bookings, TODAY_ISO)) : [];
    const courseUtil = course ? computeUtilization(buildTeeSlots(course, bookings, TODAY_ISO)) : { booked: 0, total: 0, pct: 0 };
    const bays = resources.filter((r) => r.resource_type === "bay");
    const activeBays = bays.filter((r) => r.status !== "maintenance");
    const bookedBayIds = new Set(
      bookings.filter((b) => b.booking_date === TODAY_ISO && b.booking_type === "driving_range" && b.status !== "cancelled").map((b) => b.resource_id),
    );
    const rangePct = activeBays.length ? Math.round((bookedBayIds.size / activeBays.length) * 100) : 0;
    const peak = [...bands].sort((a, b) => b.util_pct - a.util_pct)[0];
    const quiet = [...bands].sort((a, b) => a.util_pct - b.util_pct)[0];
    return { bands, courseUtil, rangePct, activeBays: activeBays.length, bookedBays: bookedBayIds.size, peak, quiet };
  }, [course, bookings, resources]);

  // ── no-show ──
  const ns = useMemo<NsAgg>(() => {
    const active = bookings.filter((b) => b.status !== "cancelled");
    const noShow = active.filter((b) => b.status === "no_show").length;
    const completed = active.filter((b) => b.status === "completed").length;
    const rate = noShow + completed > 0 ? Math.round((noShow / (noShow + completed)) * 100) : 0;
    const loss = active.filter((b) => b.status === "no_show").reduce((s, b) => s + (b.total_amount ?? 0), 0);
    const offenders = members
      .filter((m) => m.no_show_count > 0)
      .sort((a, b) => b.no_show_count - a.no_show_count)
      .slice(0, 8);
    return { noShow, completed, rate, loss, offenders };
  }, [bookings, members]);

  // export ตาม tab ปัจจุบัน
  function exportCurrent() {
    if (tab === "revenue") {
      downloadCsv(
        "golf-revenue.csv",
        ["ช่องทาง", "จำนวนจอง", "รายได้ (฿)"],
        rev.byChannel.map(([c, v]) => [CHANNEL_LABEL[c], v.count, v.amount.toFixed(2)]),
      );
    } else if (tab === "utilization") {
      downloadCsv(
        "golf-utilization.csv",
        ["ช่วงเวลา", "จองแล้ว", "ช่องทั้งหมด", "utilization %"],
        util.bands.map((b) => [b.label, b.booked, b.slots, b.util_pct]),
      );
    } else if (tab === "noshow") {
      downloadCsv(
        "golf-noshow.csv",
        ["สมาชิก", "no-show สะสม"],
        ns.offenders.map((m) => [m.display_name, m.no_show_count]),
      );
    } else {
      downloadCsv(
        "golf-membership.csv",
        ["แพ็กเกจ", "tier", "จำนวนสมาชิก", "ราคา/ปี (฿)"],
        mem.byPlan.map((p) => [p.name, TIER_LABEL[p.tier], p.count, p.price.toFixed(2)]),
      );
    }
    notify.success("ส่งออก CSV แล้ว (จำลอง)");
  }

  return (
    <GolfShell
      title="รายงาน"
      description="วิเคราะห์รายได้ · utilization · no-show · สมาชิกภาพ (ย้อนหลัง)"
      icon={<BarChart3 className="h-6 w-6" />}
      actions={
        !restricted ? (
          <Button variant="outline" onClick={exportCurrent}>
            <Download className="mr-1.5 h-4 w-4" />
            ส่งออก CSV
          </Button>
        ) : undefined
      }
    >
      {/* KPI สรุป (ทุก role เห็น = สรุปพื้นฐาน) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Banknote className="h-4 w-4" />} label="รายได้รวม (ทุกวัน)" value={formatAmount(rev.total)} tone="positive" valueColored />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="รายได้สนามกอล์ฟ" value={formatAmount(rev.tee)} sub={`${fmtNum(rev.count)} รายการจอง`} tone="info" valueColored />
        <StatCard icon={<Target className="h-4 w-4" />} label="รายได้สนามไดร์ฟ" value={formatAmount(rev.range)} tone="primary" valueColored />
        <StatCard icon={<BadgeCheck className="h-4 w-4" />} label="รายได้สมาชิกภาพ/ปี" value={formatAmount(mem.recurring)} sub={`${fmtNum(mem.activeCount)} สมาชิกใช้งาน`} tone="warning" valueColored />
      </div>

      {restricted ? (
        <AccessLockBanner>
          โหมดพนักงาน — เห็น <span className="font-medium">สรุปรายได้พื้นฐาน</span> ได้
          แต่รายงานเชิงลึก (utilization/no-show/สมาชิกภาพ · AI แนะราคา · ส่งออก) ต้องมีสิทธิ์ผู้จัดการ/เจ้าของ
        </AccessLockBanner>
      ) : (
        <>
          {/* AI-3 teaser */}
          <AiPricingCard canRun={canRunAi} />

          {/* tab toggle */}
          <div className="overflow-x-auto">
            <SegmentedControl
              value={tab}
              onChange={setTab}
              ariaLabel="มุมมองรายงาน"
              options={[
                { value: "revenue", label: "รายได้" },
                { value: "utilization", label: "การใช้สนาม" },
                { value: "noshow", label: "no-show" },
                { value: "membership", label: "สมาชิกภาพ" },
              ]}
            />
          </div>

          {tab === "revenue" && <RevenueTab rev={rev} />}
          {tab === "utilization" && <UtilizationTab util={util} />}
          {tab === "noshow" && <NoShowTab ns={ns} bookings={bookings} />}
          {tab === "membership" && <MembershipTab mem={mem} />}
        </>
      )}
    </GolfShell>
  );
}

// ==================== bar row helper (div bar — Tailwind, ไม่ hex) ====================
function BarRow({ label, valueLabel, pct, strong }: { label: string; valueLabel: string; pct: number; strong?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="tabular-nums text-gray-500">{valueLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className={cn("h-full rounded-full", strong ? "bg-primary" : "bg-gray-300")} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
      </div>
    </div>
  );
}

function SectionHead({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 px-1">
      <span className="text-primary">{icon}</span>
      <Text className="text-sm font-semibold text-gray-900">{children}</Text>
    </div>
  );
}

// ==================== Revenue tab ====================
function RevenueTab({ rev }: { rev: RevAgg }) {
  const maxDay = Math.max(1, ...rev.byDay.map(([, v]) => v));
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* by day */}
      <div>
        <SectionHead icon={<TrendingUp className="h-4 w-4" />}>รายได้ตามวัน</SectionHead>
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {rev.byDay.map(([day, v]) => (
            <BarRow key={day} label={`${dowTH(day)} ${fmtDateTH(day)}`} valueLabel={formatAmount(v)} pct={(v / maxDay) * 100} strong />
          ))}
        </div>
      </div>

      {/* by channel */}
      <div className="min-w-0">
        <SectionHead icon={<Info className="h-4 w-4" />}>รายได้ตามช่องทาง</SectionHead>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>ช่องทาง</TableHead>
              <TableHead align="center">จอง</TableHead>
              <TableHead align="right">รายได้</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rev.byChannel.map(([c, v]) => (
              <TableRow key={c}>
                <TableCell>{CHANNEL_LABEL[c]}</TableCell>
                <TableCell align="center" className="tabular-nums">{fmtNum(v.count)}</TableCell>
                <TableCell align="right" tabular>{formatAmount(v.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* by category */}
      <div className="min-w-0 lg:col-span-2">
        <SectionHead icon={<Banknote className="h-4 w-4" />}>รายได้ตามหมวด (จาก breakdown ค่าบริการ)</SectionHead>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>หมวด</TableHead>
              <TableHead align="right">รายได้</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rev.byCategory.map(([c, v]) => (
              <TableRow key={c}>
                <TableCell>{CATEGORY_LABEL[c]}</TableCell>
                <TableCell align="right" tabular>{formatAmount(v)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ==================== Utilization tab ====================
function UtilizationTab({ util }: { util: UtilAgg }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Percent className="h-4 w-4" />} label="ใช้สนามกอล์ฟ (วันพีค)" value={`${util.courseUtil.pct}%`} sub={`จอง ${util.courseUtil.booked}/${util.courseUtil.total} ช่อง`} tone="primary" valueColored />
        <StatCard icon={<Target className="h-4 w-4" />} label="ใช้สนามไดร์ฟ (วันพีค)" value={`${util.rangePct}%`} sub={`${util.bookedBays}/${util.activeBays} bay`} tone="info" valueColored />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="ช่วงพีค / ว่างมาก" value={util.peak ? `${util.peak.util_pct}%` : "—"} sub={util.peak && util.quiet ? `พีค ${util.peak.label} · ว่าง ${util.quiet.label}` : undefined} tone="warning" />
      </div>

      <div>
        <SectionHead icon={<Percent className="h-4 w-4" />}>
          utilization ต่อช่วง (อ้างอิงวันอาทิตย์ {fmtDateTH(TODAY_ISO)} — วันพีค)
        </SectionHead>
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {util.bands.map((b) => (
            <BarRow key={b.label} label={b.label} valueLabel={`${b.booked}/${b.slots} · ${b.util_pct}%`} pct={b.util_pct} strong={b.util_pct >= 70} />
          ))}
          <Text className="pt-1 text-[11px] text-gray-400">
            ช่วงว่างมาก = โอกาสจัดโปรฯ เติมช่อง (เช่น Twilight บ่าย) · ดู “AI แนะราคา” ด้านบน
          </Text>
        </div>
      </div>
    </div>
  );
}

// ==================== No-show tab ====================
function NoShowTab({ ns, bookings }: { ns: NsAgg; bookings: GolfBooking[] }) {
  // trend ต่อวัน (นับ no_show)
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    bookings.filter((b) => b.status === "no_show").forEach((b) => map.set(b.booking_date, (map.get(b.booking_date) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [bookings]);
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<UserX className="h-4 w-4" />} label="no-show ทั้งหมด" value={fmtNum(ns.noShow)} tone={ns.noShow > 0 ? "negative" : "positive"} valueColored />
        <StatCard icon={<Percent className="h-4 w-4" />} label="อัตรา no-show" value={`${ns.rate}%`} sub={`เทียบเล่นจบ ${fmtNum(ns.completed)} รอบ`} tone="warning" valueColored />
        <StatCard icon={<Banknote className="h-4 w-4" />} label="รายได้ที่เสียไป" value={formatAmount(ns.loss)} tone="negative" valueColored />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <SectionHead icon={<UserX className="h-4 w-4" />}>แนวโน้ม no-show ต่อวัน</SectionHead>
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            {byDay.length === 0 ? (
              <Text className="py-4 text-center text-sm text-gray-500">ยังไม่มี no-show ในช่วงข้อมูล</Text>
            ) : (
              byDay.map(([day, v]) => (
                <BarRow key={day} label={`${dowTH(day)} ${fmtDateTH(day)}`} valueLabel={`${v} รอบ`} pct={(v / maxDay) * 100} strong />
              ))
            )}
          </div>
        </div>

        <div className="min-w-0">
          <SectionHead icon={<UserX className="h-4 w-4" />}>สมาชิกที่ no-show บ่อย</SectionHead>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>สมาชิก</TableHead>
                <TableHead align="center">ประเภท</TableHead>
                <TableHead align="right">no-show สะสม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ns.offenders.length === 0 ? (
                <TableEmpty colSpan={3}>ไม่มีสมาชิกที่มีประวัติ no-show</TableEmpty>
              ) : (
                ns.offenders.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-gray-900">{m.display_name}</TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={m.no_show_count >= 3 ? "danger" : "warning"}>{MEMBER_TYPE_LABEL[m.member_type]}</StatusBadge>
                    </TableCell>
                    <TableCell align="right" className="tabular-nums font-semibold text-gray-900">{m.no_show_count} ครั้ง</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ==================== Membership tab ====================
function MembershipTab({ mem }: { mem: MemAgg }) {
  const totalSeg = Math.max(1, mem.seg.member + mem.seg.vip + mem.seg.guest);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionHead icon={<BadgeCheck className="h-4 w-4" />}>สมาชิกตามแพ็กเกจ</SectionHead>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>แพ็กเกจ</TableHead>
                <TableHead align="center">สมาชิก</TableHead>
                <TableHead align="right">ราคา/ปี</TableHead>
                <TableHead align="right">รายได้รวม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mem.byPlan.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-medium text-gray-900">{p.name}</TableCell>
                  <TableCell align="center" className="tabular-nums">{fmtNum(p.count)}</TableCell>
                  <TableCell align="right" tabular>{formatAmount(p.price)}</TableCell>
                  <TableCell align="right" tabular>{formatAmount(p.price * p.count)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div>
          <SectionHead icon={<TrendingUp className="h-4 w-4" />}>รายได้จอง: สมาชิก vs บุคคลทั่วไป</SectionHead>
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <BarRow label="สมาชิก" valueLabel={formatAmount(mem.seg.member)} pct={(mem.seg.member / totalSeg) * 100} strong />
            <BarRow label="VIP" valueLabel={formatAmount(mem.seg.vip)} pct={(mem.seg.vip / totalSeg) * 100} strong />
            <BarRow label="บุคคลทั่วไป (walk-in/guest)" valueLabel={formatAmount(mem.seg.guest)} pct={(mem.seg.guest / totalSeg) * 100} />
            <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
              {(["silver", "gold", "platinum", "none"] as const).map((t) => (
                <span key={t} className="inline-flex items-center gap-1">
                  <span className="font-medium text-gray-700">{TIER_LABEL[t]}</span>
                  <span className="tabular-nums">{fmtNum(mem.tierCount[t] ?? 0)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== AI-3 — Dynamic Pricing Suggestion (beta teaser) ====================
function AiPricingCard({ canRun }: { canRun: boolean }) {
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);
  const data = golfPricingSuggestion;

  function run() {
    setLoading(true);
    setShown(false);
    setTimeout(() => {
      setShown(true);
      setLoading(false);
    }, 1300);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <Text className="text-sm font-semibold text-gray-900">คำแนะนำราคาจาก AI</Text>
              <StatusBadge tone="info">beta</StatusBadge>
            </div>
            <Text className="text-xs text-gray-500">วิเคราะห์ utilization ต่อช่วง → แนะปรับกรีนฟี/ตะกร้าตาม demand</Text>
          </div>
        </div>
        {canRun && (
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                กำลังวิเคราะห์…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" />
                แนะนำราคาด้วย AI
              </>
            )}
          </Button>
        )}
      </div>

      {!canRun && (
        <div className="mt-3">
          <AccessLockBanner>AI แนะราคา + ปุ่ม “นำไปตั้งราคา” ต้องมีสิทธิ์ผู้จัดการ/เจ้าของ</AccessLockBanner>
        </div>
      )}

      {loading && (
        <div className="mt-4 animate-pulse space-y-2">
          <div className="h-4 w-3/4 rounded bg-gray-100" />
          <div className="h-16 w-full rounded bg-gray-100" />
        </div>
      )}

      {shown && !loading && (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed text-gray-700">{data.output.narration}</p>
          <div className="min-w-0 overflow-x-auto">
            <Table className="shadow-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>รายการ</TableHead>
                  <TableHead align="right">ราคาปัจจุบัน</TableHead>
                  <TableHead align="center">util</TableHead>
                  <TableHead align="right">แนะนำ</TableHead>
                  <TableHead align="center">Δ</TableHead>
                  <TableHead align="right">ทำ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.input.items.map((it) => {
                  const up = it.delta_pct >= 0;
                  return (
                    <TableRow key={it.key}>
                      <TableCell className="text-gray-900">{it.label}</TableCell>
                      <TableCell align="right" tabular>{formatAmount(it.current_price)}</TableCell>
                      <TableCell align="center" className="tabular-nums text-gray-500">{it.util_pct}%</TableCell>
                      <TableCell align="right" tabular className="font-semibold text-gray-900">{formatAmount(it.suggested_price)}</TableCell>
                      <TableCell align="center">
                        <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", up ? "text-green-600" : "text-red-600")}>
                          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {up ? "+" : "−"}
                          {Math.abs(it.delta_pct)}%
                        </span>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => notify.info(`เตรียมตั้งราคา "${it.label}" → ${formatAmount(it.suggested_price)} (ยังไม่บันทึก — เปิดหน้าราคาเพื่อยืนยัน)`)}
                        >
                          นำไปตั้งราคา
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {data.output.disclaimer} · ความเชื่อมั่น {Math.round(data.output.confidence * 100)}% ·
              ปุ่ม “นำไปตั้งราคา” = เตรียมค่าให้เท่านั้น ไม่บันทึกทับราคาจริง
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

