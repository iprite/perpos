"use client";

// membership/page.tsx — แพ็กเกจสมาชิกรายปี [D3] — P4b Group B
// Table plans (silver/gold/platinum) CRUD + สมัคร/ต่ออายุให้สมาชิก · owner/manager เขียนได้ · staff = read-only
// mock client state (useGolfData)

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Plus,
  UserPlus,
  Banknote,
  Users,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
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
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { notify } from "@/lib/toast";
import {
  GolfShell,
  AccessLockBanner,
  useGolfRole,
  useGolfData,
  formatAmount,
  fmtNum,
  fmtDateTH,
  TODAY_ISO,
  TIER_LABEL,
} from "../_components";
import { MembershipPlanDialog } from "../_components/membership-plan-dialog";
import type { GolfMembershipPlan, GolfTier } from "../_fixtures/types";

const TIER_TONE: Record<GolfTier, BadgeTone> = {
  none: "neutral",
  silver: "neutral",
  gold: "warning",
  platinum: "info",
};

export default function GolfMembershipPage() {
  const { canWrite } = useGolfRole();
  const writable = canWrite("membership");
  const { plans, members } = useGolfData();

  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<GolfMembershipPlan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  }, []);

  const memberCountByPlan = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      if (m.membership_plan_id) map.set(m.membership_plan_id, (map.get(m.membership_plan_id) ?? 0) + 1);
    }
    return map;
  }, [members]);

  const kpi = useMemo(() => {
    const activePlans = plans.filter((p) => p.is_active).length;
    let activeMembers = 0;
    let recurring = 0;
    for (const m of members) {
      if (!m.membership_plan_id) continue;
      const alive = m.membership_expires_at ? m.membership_expires_at >= TODAY_ISO : false;
      if (!alive) continue;
      const plan = plans.find((p) => p.id === m.membership_plan_id);
      if (plan) {
        activeMembers += 1;
        recurring += plan.price_per_year;
      }
    }
    return { activePlans, totalPlans: plans.length, activeMembers, recurring };
  }, [plans, members]);

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.price_per_year - b.price_per_year),
    [plans],
  );

  return (
    <GolfShell
      title="แพ็กเกจสมาชิก"
      description="ขายสมาชิกรายปี — คุมระดับ/สิทธิ์/ส่วนลด และสมัคร/ต่ออายุให้ลูกค้า (รายได้ recurring)"
      icon={<BadgeCheck className="h-6 w-6" />}
      actions={
        writable ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSubOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              สมัคร/ต่ออายุ
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              สร้างแพ็กเกจ
            </Button>
          </div>
        ) : undefined
      }
    >
      {!writable && (
        <AccessLockBanner>
          โหมดดูอย่างเดียว — การสร้าง/แก้ไขแพ็กเกจและการสมัครสมาชิกสงวนไว้สำหรับผู้จัดการ/เจ้าของ
        </AccessLockBanner>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<BadgeCheck className="h-4 w-4" />}
          label="แพ็กเกจเปิดขาย"
          value={fmtNum(kpi.activePlans)}
          sub={`ทั้งหมด ${fmtNum(kpi.totalPlans)} แพ็กเกจ`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="สมาชิกที่ยัง active"
          value={fmtNum(kpi.activeMembers)}
          tone="primary"
          valueColored
        />
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="รายได้ recurring/ปี"
          value={formatAmount(kpi.recurring)}
          sub="จากสมาชิกที่ยังไม่หมดอายุ"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Percent className="h-4 w-4" />}
          label="แพ็กเกจสูงสุด"
          value={
            sortedPlans.length ? TIER_LABEL[sortedPlans[sortedPlans.length - 1].tier] : "—"
          }
          sub={
            sortedPlans.length
              ? formatAmount(sortedPlans[sortedPlans.length - 1].price_per_year)
              : "ยังไม่มีแพ็กเกจ"
          }
          tone="neutral"
        />
      </div>

      {/* table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>แพ็กเกจ</TableHead>
            <TableHead align="center">ระดับ</TableHead>
            <TableHead align="right">ราคา/ปี</TableHead>
            <TableHead align="center">ส่วนลดกรีนฟี</TableHead>
            <TableHead align="center">ตะกร้าฟรี/เดือน</TableHead>
            <TableHead align="center">แต้ม×</TableHead>
            <TableHead align="center">สมาชิก</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={8} />
          ) : sortedPlans.length === 0 ? (
            <TableEmpty colSpan={8}>
              <div className="flex flex-col items-center gap-2 py-8">
                <BadgeCheck className="h-8 w-8 text-gray-300" />
                <span>ยังไม่มีแพ็กเกจสมาชิก</span>
                <span className="text-xs text-gray-400">
                  สร้างแพ็กเกจรายปีเพื่อขายสมาชิกและให้ราคาพิเศษ
                </span>
                {writable && (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    สร้างแพ็กเกจสมาชิก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            sortedPlans.map((p) => (
              <TableRow
                key={p.id}
                clickable={writable}
                onClick={writable ? () => setEdit(p) : undefined}
              >
                <TableCell className="font-medium text-gray-900">{p.name}</TableCell>
                <TableCell align="center">
                  <StatusBadge tone={TIER_TONE[p.tier]}>{TIER_LABEL[p.tier]}</StatusBadge>
                </TableCell>
                <TableCell align="right" tabular>
                  {formatAmount(p.price_per_year)}
                </TableCell>
                <TableCell align="center" className="tabular-nums text-gray-700">
                  {p.green_fee_discount_pct != null ? `${p.green_fee_discount_pct}%` : "—"}
                </TableCell>
                <TableCell align="center" className="tabular-nums text-gray-700">
                  {p.free_buckets_per_month != null ? `${fmtNum(p.free_buckets_per_month)} ตะกร้า` : "—"}
                </TableCell>
                <TableCell align="center" className="tabular-nums text-gray-700">
                  ×{p.points_multiplier ?? 1}
                </TableCell>
                <TableCell align="center" className="tabular-nums text-gray-700">
                  {fmtNum(memberCountByPlan.get(p.id) ?? 0)}
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={p.is_active ? "success" : "neutral"}>
                    {p.is_active ? "เปิดขาย" : "ปิด"}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* dialogs */}
      <MembershipPlanDialog plan={null} open={createOpen} onOpenChange={setCreateOpen} />
      <MembershipPlanDialog
        plan={edit}
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
      />
      <SubscribeMemberDialog open={subOpen} onOpenChange={setSubOpen} />
    </GolfShell>
  );
}

// ── สมัคร/ต่ออายุแพ็กเกจให้สมาชิก (subscribeMember mutator) ──
function SubscribeMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { members, plans, subscribeMember } = useGolfData();
  const [memberId, setMemberId] = useState("");
  const [planId, setPlanId] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (open) {
      setMemberId("");
      setPlanId("");
      setErr(false);
    }
  }, [open]);

  const activePlans = useMemo(() => plans.filter((p) => p.is_active), [plans]);
  const selectedMember = members.find((m) => m.id === memberId);
  const selectedPlan = plans.find((p) => p.id === planId);

  const memberOptions = useMemo(
    () => [
      { value: "", label: "— เลือกลูกค้า —" },
      ...members.map((m) => ({
        value: m.id,
        label: `${m.display_name}${m.member_no ? ` (${m.member_no})` : ""}`,
      })),
    ],
    [members],
  );
  const planOptions = useMemo(
    () => [
      { value: "", label: "— เลือกแพ็กเกจ —" },
      ...activePlans.map((p) => ({
        value: p.id,
        label: `${p.name} · ${formatAmount(p.price_per_year)}`,
      })),
    ],
    [activePlans],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId || !planId) {
      setErr(true);
      return;
    }
    subscribeMember(memberId, planId);
    notify.success(
      `สมัคร ${selectedPlan?.name} ให้ ${selectedMember?.display_name} แล้ว — สะท้อนในหน้าสมาชิกทันที`,
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>สมัคร / ต่ออายุแพ็กเกจให้สมาชิก</DialogTitle>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="sub-member">ลูกค้า *</Label>
                <CustomSelect
                  className="mt-1"
                  value={memberId}
                  onChange={setMemberId}
                  options={memberOptions}
                />
              </div>
              <div>
                <Label htmlFor="sub-plan">แพ็กเกจ *</Label>
                <CustomSelect
                  className="mt-1"
                  value={planId}
                  onChange={setPlanId}
                  options={planOptions}
                />
              </div>

              {selectedPlan && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
                  <Text className="text-xs font-medium text-gray-500">ผลหลังสมัคร</Text>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <StatusBadge tone={TIER_TONE[selectedPlan.tier]}>
                      {TIER_LABEL[selectedPlan.tier]}
                    </StatusBadge>
                    <span className="text-gray-700">
                      หมดอายุ {fmtDateTH(addMonths(TODAY_ISO, selectedPlan.duration_months))}
                    </span>
                    <span className="text-gray-500">
                      · ส่วนลดกรีนฟี {selectedPlan.green_fee_discount_pct ?? 0}% · แต้ม ×
                      {selectedPlan.points_multiplier ?? 1}
                    </span>
                  </div>
                </div>
              )}

              {err && (
                <p className="text-xs text-red-600">กรุณาเลือกทั้งลูกค้าและแพ็กเกจ</p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit">
              <UserPlus className="mr-1.5 h-4 w-4" /> สมัครให้สมาชิก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** preview วันหมดอายุ (mutator ใช้สูตรเดียวกัน) */
function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
