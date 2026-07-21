"use client";

// member-detail-dialog.tsx — โปรไฟล์สมาชิก/ลูกค้า + ประวัติจอง + แต้ม (earn/redeem) + สมาชิกภาพ + AI-2
// mutators: updateMember (tier), addPointTxn (earn/redeem — อัปเดต balance สด)
// AI-2 no-show risk: 3 anchor ใช้ canned จาก ai-mocks.ts · รายอื่น rule-based จากเลขจริง
// binding: tier=CustomSelect (4 ค่า) · แต้ม=tabular-nums (ห้าม tabular prop) · เงิน tabular+U+2212
//
// member prop = snapshot (stable ref) จาก list — resolve live data ผ่าน store ด้วย id
// จึง earn/redeem/แก้ tier อัปเดตสดโดยไม่ reset ปุ่ม AI/ช่องกรอก (seed effect ผูกกับ snapshot)

import { useEffect, useMemo, useState } from "react";
import {
  User,
  Phone,
  MessageCircle,
  Star,
  Plus,
  Minus,
  CalendarClock,
  CalendarPlus,
  BadgeCheck,
  Sparkles,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { Text } from "@/components/ui/typography";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import cn from "@core/utils/class-names";
import { notify } from "@/lib/toast";
import { useGolfData } from "./data-context";
import { useGolfRole } from "./role-context";
import { BookingFormDialog } from "./booking-form-dialog";
import { formatAmount, fmtNum } from "./money";
import { fmtDateTH, TODAY_ISO } from "./format";
import { BookingStatusBadge, MemberTypeBadge, TIER_LABEL } from "./badges";
import {
  golfRiskHigh,
  golfRiskMedium,
  golfRiskLow,
  type GolfNoShowRisk,
} from "../_fixtures/ai-mocks";
import type { GolfMember, GolfTier } from "../_fixtures/types";

const TIER_OPTIONS: { value: GolfTier; label: string }[] = [
  { value: "none", label: "— ไม่มีระดับ —" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
];

const TIER_TONE: Record<GolfTier, BadgeTone> = {
  none: "neutral",
  silver: "neutral",
  gold: "warning",
  platinum: "info",
};

const STATUS_META: Record<GolfMember["status"], { tone: BadgeTone; label: string }> = {
  active: { tone: "success", label: "ใช้งาน" },
  inactive: { tone: "neutral", label: "ไม่ใช้งาน" },
  blocked: { tone: "danger", label: "ถูกบล็อก" },
};

// map anchor member → canned AI-2 result (ตรง ai-mocks.ts)
const ANCHOR_RISK: Record<string, GolfNoShowRisk> = {
  "gm-014": golfRiskHigh,
  "gm-027": golfRiskMedium,
  "gm-003": golfRiskLow,
};

type RiskOutput = GolfNoShowRisk["output"];

/** rule-based fallback สำหรับสมาชิกที่ไม่ใช่ 3 anchor — ใช้เลขจริงจาก member */
function computeMemberRisk(m: GolfMember, totalBookings: number): RiskOutput {
  const rate = totalBookings > 0 ? Math.round((m.no_show_count / totalBookings) * 100) : 0;
  const name = m.display_name;
  if (m.no_show_count >= 3 || rate >= 25) {
    return {
      risk_level: "high",
      reason: `${name} ไม่มาตามนัด ${m.no_show_count} ครั้งจาก ${totalBookings} ครั้ง (อัตรา no-show ${rate}%) ถือว่าสูง หากจองช่วงพีคแล้วหลุดจะเสียช่องที่ขายต่อได้ยาก — ความเสี่ยงสูง`,
      suggest: [
        "ขอมัดจำก่อนยืนยันคิวทุกครั้ง (เช่น 50% ของกรีนฟี)",
        "ส่งข้อความยืนยันซ้ำทาง LINE ก่อนถึงวันเล่น",
        "พิจารณาเตรียม waitlist ช่วงพีคไว้แทน",
      ],
      confidence: 0.82,
    };
  }
  if (m.no_show_count >= 1 || rate >= 10) {
    return {
      risk_level: "medium",
      reason: `${name} มีประวัติ no-show ${m.no_show_count} ครั้งจาก ${totalBookings} ครั้ง (${rate}%) ยังอยู่ในเกณฑ์ที่รับได้ แต่ควรเฝ้าระวังคิวช่วงพีค — เสี่ยงระดับกลาง`,
      suggest: [
        "ส่งเตือนยืนยันคิวก่อนถึงวันเล่นตามปกติ",
        "ถ้าจองช่วงพีคและยังไม่ชำระ ค่อยขอมัดจำ",
      ],
      confidence: 0.78,
    };
  }
  return {
    risk_level: "low",
    reason:
      totalBookings > 0
        ? `${name} ออกรอบ ${totalBookings} ครั้ง ไม่เคย no-show — ลูกค้าประจำที่ไว้ใจได้ ความเสี่ยงต่ำมาก`
        : `${name} ยังไม่มีประวัติการจองในระบบ — ยังไม่มีข้อมูลพอชี้ความเสี่ยง ถือว่าต่ำโดยปริยาย`,
    suggest: ["ไม่ต้องดำเนินการเพิ่ม — พร้อมต้อนรับตามคิว"],
    confidence: 0.9,
  };
}

const RISK_META: Record<
  RiskOutput["risk_level"],
  { tone: BadgeTone; label: string; icon: React.ReactNode }
> = {
  high: { tone: "danger", label: "เสี่ยงสูง", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  medium: { tone: "warning", label: "เสี่ยงปานกลาง", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  low: { tone: "success", label: "เสี่ยงต่ำ", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
};

export function MemberDetailDialog({
  member,
  open,
  onOpenChange,
}: {
  /** snapshot จาก list (stable ref) — live data resolve จาก store ด้วย id */
  member: GolfMember | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { members, bookings, points, plans, updateMember, addPointTxn } = useGolfData();
  const { canWrite } = useGolfRole();
  const writable = canWrite("members");

  const [tier, setTier] = useState<GolfTier>("none");
  const [ptAmount, setPtAmount] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<RiskOutput | null>(null);
  const [bookOpen, setBookOpen] = useState(false);

  // seed effect ผูกกับ snapshot (stable) → ไม่ reset ตอน earn/redeem
  useEffect(() => {
    if (member) {
      setTier(member.tier);
      setPtAmount("");
      setAiLoading(false);
      setAiResult(null);
      setBookOpen(false);
    }
  }, [member]);

  // live member จาก store (points/tier อัปเดตสด)
  const m = useMemo(
    () => (member ? members.find((x) => x.id === member.id) ?? member : null),
    [members, member],
  );

  const history = useMemo(() => {
    if (!m) return [];
    return bookings
      .filter((b) => b.member_id === m.id)
      .sort((a, b) =>
        a.booking_date === b.booking_date
          ? b.start_time.localeCompare(a.start_time)
          : b.booking_date.localeCompare(a.booking_date),
      );
  }, [bookings, m]);

  const ledger = useMemo(() => {
    if (!m) return [];
    return points
      .filter((p) => p.member_id === m.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [points, m]);

  const plan = useMemo(
    () => (m?.membership_plan_id ? plans.find((p) => p.id === m.membership_plan_id) : null),
    [plans, m],
  );

  if (!m) return null;

  const fromLine = !!m.line_user_id;
  const expiresActive = m.membership_expires_at ? m.membership_expires_at >= TODAY_ISO : false;

  function handleTierChange(v: string) {
    if (!writable) return;
    const next = v as GolfTier;
    setTier(next);
    if (m) {
      updateMember(m.id, { tier: next });
      notify.updated(`ปรับระดับสมาชิกเป็น ${TIER_LABEL[next]}`);
    }
  }

  function earn() {
    if (!writable) return;
    const n = Number(ptAmount);
    if (!Number.isFinite(n) || n <= 0) {
      notify.error("กรุณากรอกจำนวนแต้มที่มากกว่า 0");
      return;
    }
    if (!m) return;
    addPointTxn({
      member_id: m.id,
      txn_type: "earn",
      points: n,
      booking_id: null,
      description: `เพิ่มแต้มด้วยตนเอง +${fmtNum(n)} แต้ม`,
      created_by: null,
    });
    setPtAmount("");
    notify.success(`เพิ่ม ${fmtNum(n)} แต้มให้ ${m.display_name} แล้ว`);
  }

  function redeem() {
    if (!writable) return;
    const n = Number(ptAmount);
    if (!Number.isFinite(n) || n <= 0) {
      notify.error("กรุณากรอกจำนวนแต้มที่มากกว่า 0");
      return;
    }
    if (!m) return;
    if (n > m.points_balance) {
      notify.error("แต้มคงเหลือไม่พอสำหรับการแลก");
      return;
    }
    addPointTxn({
      member_id: m.id,
      txn_type: "redeem",
      points: -n,
      booking_id: null,
      description: `แลกแต้ม −${fmtNum(n)} แต้ม`,
      created_by: null,
    });
    setPtAmount("");
    notify.success(`แลก ${fmtNum(n)} แต้มของ ${m.display_name} แล้ว`);
  }

  function runAi() {
    if (!m) return;
    setAiLoading(true);
    setAiResult(null);
    const canned = ANCHOR_RISK[m.id];
    const out: RiskOutput = canned ? canned.output : computeMemberRisk(m, history.length);
    // จำลอง latency AI ~1000ms
    setTimeout(() => {
      setAiResult(out);
      setAiLoading(false);
    }, 1000);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              <Avatar name={m.display_name} className="h-8 w-8 text-xs" />
              {m.display_name}
              <MemberTypeBadge type={m.member_type} />
              {m.tier !== "none" && (
                <StatusBadge tone={TIER_TONE[m.tier]}>{TIER_LABEL[m.tier]}</StatusBadge>
              )}
              {fromLine && (
                <StatusBadge tone="info" className="gap-1">
                  <MessageCircle className="h-3 w-3" />
                  จาก LINE
                </StatusBadge>
              )}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            {/* ── โปรไฟล์ + สรุปเร็ว ── */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <InfoTile icon={<Phone className="h-4 w-4" />} label="เบอร์โทร" value={m.phone ?? "—"} />
              <InfoTile
                icon={<Star className="h-4 w-4" />}
                label="แต้มสะสมคงเหลือ"
                value={`${fmtNum(m.points_balance)} แต้ม`}
                tabularNums
              />
              <InfoTile
                icon={<User className="h-4 w-4" />}
                label="รหัสสมาชิก"
                value={m.member_no ?? "ลูกค้าทั่วไป"}
                badge={
                  <StatusBadge tone={STATUS_META[m.status].tone}>
                    {STATUS_META[m.status].label}
                  </StatusBadge>
                }
              />
            </div>

            {m.notes && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                {m.notes}
              </div>
            )}

            {/* ── สมาชิกภาพ + tier ── */}
            <Section icon={<BadgeCheck className="h-4 w-4" />} title="สมาชิกภาพ">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="mem-tier">ระดับสมาชิก (tier)</Label>
                  <CustomSelect
                    className="mt-1"
                    value={tier}
                    onChange={handleTierChange}
                    options={TIER_OPTIONS}
                    disabled={!writable}
                  />
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <Text className="text-xs text-gray-500">แพ็กเกจ / วันหมดอายุ</Text>
                  {plan ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Text className="text-sm font-medium text-gray-900">{plan.name}</Text>
                      <StatusBadge tone={expiresActive ? "success" : "danger"}>
                        {expiresActive ? "ใช้งาน" : "หมดอายุ"}
                      </StatusBadge>
                      <Text className="text-xs text-gray-500">
                        ถึง {fmtDateTH(m.membership_expires_at)}
                      </Text>
                    </div>
                  ) : (
                    <Text className="mt-1 text-sm text-gray-400">
                      ยังไม่ได้สมัครแพ็กเกจรายปี (สมัครได้ที่หน้า “แพ็กเกจสมาชิก”)
                    </Text>
                  )}
                </div>
              </div>
            </Section>

            {/* ── แต้มสะสม + earn/redeem ── */}
            <Section icon={<Star className="h-4 w-4" />} title="แต้มสะสม">
              {writable && (
                <div className="mb-3 flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Label htmlFor="pt-amount">จำนวนแต้ม</Label>
                    <Input
                      id="pt-amount"
                      type="number"
                      min={1}
                      className="mt-1"
                      placeholder="เช่น 200"
                      value={ptAmount}
                      onChange={(e) => setPtAmount(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={earn}>
                      <Plus className="mr-1.5 h-4 w-4" /> เพิ่มแต้ม
                    </Button>
                    <Button variant="outline" onClick={redeem}>
                      <Minus className="mr-1.5 h-4 w-4" /> แลกแต้ม
                    </Button>
                  </div>
                </div>
              )}

              {ledger.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                  ยังไม่มีประวัติแต้ม
                </div>
              ) : (
                <Table stickyHeader maxHeight="14rem" className="shadow-sm">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>วันที่</TableHead>
                      <TableHead>รายการ</TableHead>
                      <TableHead align="right">แต้ม</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-gray-500 tabular-nums">
                          {fmtDateTH(p.created_at)}
                        </TableCell>
                        <TableCell wrap className="text-gray-700">
                          {p.description}
                        </TableCell>
                        <TableCell
                          align="right"
                          className={cn(
                            "tabular-nums font-medium",
                            p.points >= 0 ? "text-green-600" : "text-red-600",
                          )}
                        >
                          {p.points >= 0 ? "+" : "−"}
                          {fmtNum(Math.abs(p.points))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>

            {/* ── AI-2 no-show risk ── */}
            <Section icon={<Sparkles className="h-4 w-4" />} title="ประเมินความเสี่ยง no-show ด้วย AI">
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Text className="text-xs text-gray-500">
                    ประวัติ no-show {fmtNum(m.no_show_count)} ครั้ง จาก {fmtNum(history.length)}{" "}
                    การจอง — AI ประเมินความเสี่ยงและแนะแนวทาง
                  </Text>
                  <Button size="sm" onClick={runAi} disabled={aiLoading}>
                    {aiLoading ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        กำลังประเมิน…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 h-4 w-4" />
                        ประเมิน no-show ด้วย AI
                      </>
                    )}
                  </Button>
                </div>

                {aiLoading && (
                  <div className="mt-3 animate-pulse space-y-2">
                    <div className="h-4 w-1/3 rounded bg-gray-100" />
                    <div className="h-4 w-full rounded bg-gray-100" />
                    <div className="h-4 w-2/3 rounded bg-gray-100" />
                  </div>
                )}

                {aiResult && !aiLoading && (
                  <div className="mt-3 space-y-3">
                    <StatusBadge tone={RISK_META[aiResult.risk_level].tone} className="gap-1">
                      {RISK_META[aiResult.risk_level].icon}
                      {RISK_META[aiResult.risk_level].label}
                    </StatusBadge>
                    <p className="text-sm leading-relaxed text-gray-700">{aiResult.reason}</p>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                        <Lightbulb className="h-3.5 w-3.5" />
                        คำแนะนำ
                      </div>
                      <ul className="space-y-1.5">
                        {aiResult.suggest.map((s, i) => (
                          <li key={i} className="flex gap-2 text-xs text-blue-800">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Text className="text-[11px] text-gray-400">
                      ความเชื่อมั่น {Math.round(aiResult.confidence * 100)}% · AI ประเมินจากประวัติที่ระบบมี
                      (ตรวจทานก่อนตัดสินใจ)
                    </Text>
                  </div>
                )}
              </div>
            </Section>

            {/* ── ประวัติการจอง ── */}
            <Section
              icon={<CalendarClock className="h-4 w-4" />}
              title={`ประวัติการจอง (${fmtNum(history.length)})`}
            >
              {history.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                  ยังไม่มีประวัติการจอง
                </div>
              ) : (
                <Table stickyHeader maxHeight="16rem" className="shadow-sm">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>เลขที่ / วันที่</TableHead>
                      <TableHead align="center">สถานะ</TableHead>
                      <TableHead align="right">ยอดรวม</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="font-medium text-gray-900 tabular-nums">
                            {b.booking_ref ?? "—"}
                          </div>
                          <div className="text-xs text-gray-500 tabular-nums">
                            {fmtDateTH(b.booking_date)} · {b.start_time}
                          </div>
                        </TableCell>
                        <TableCell align="center">
                          <BookingStatusBadge status={b.status} />
                        </TableCell>
                        <TableCell align="right" tabular>
                          {formatAmount(b.total_amount ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>
          </div>
        </DialogBody>
        <DialogFooter>
          {writable && (
            <Button
              variant="secondary"
              className="mr-auto"
              onClick={() => setBookOpen(true)}
            >
              <CalendarPlus className="mr-1.5 h-4 w-4" /> จองให้ลูกค้ารายนี้
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <BookingFormDialog
      open={bookOpen}
      onOpenChange={setBookOpen}
      prefill={{ memberId: m.id }}
    />
    </>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <Text className="text-sm font-semibold text-gray-900">{title}</Text>
      </div>
      {children}
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  badge,
  tabularNums,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: React.ReactNode;
  tabularNums?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="text-gray-400">{icon}</span>
        {label}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <Text className={cn("text-sm font-medium text-gray-900", tabularNums && "tabular-nums")}>
          {value}
        </Text>
        {badge}
      </div>
    </div>
  );
}
