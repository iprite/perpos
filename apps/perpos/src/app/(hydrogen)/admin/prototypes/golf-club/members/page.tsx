"use client";

// members/page.tsx — สมาชิก/ลูกค้า (จาก LINE + walk-in) — Group B
// Table + filter (ประเภท/tier/สถานะ + ค้นหา) · badge "จาก LINE" · เพิ่ม walk-in · row → member-detail-dialog
// mock client state (useGolfData) — mutation ในหน่วยความจำ

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Search,
  UserPlus,
  MessageCircle,
  Star,
  BadgeCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
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
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { notify } from "@/lib/toast";
import {
  GolfShell,
  AccessLockBanner,
  useGolfRole,
  useGolfData,
  fmtNum,
  MemberTypeBadge,
  TIER_LABEL,
} from "../_components";
import { MemberDetailDialog } from "../_components/member-detail-dialog";
import type { GolfMember, GolfTier, GolfMemberType } from "../_fixtures/types";

const TYPE_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  { value: "member", label: "สมาชิก" },
  { value: "vip", label: "VIP" },
  { value: "guest", label: "บุคคลทั่วไป" },
];
const TIER_FILTER_OPTIONS = [
  { value: "", label: "ทุกระดับ" },
  { value: "none", label: "ไม่มีระดับ" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
];
const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "active", label: "ใช้งาน" },
  { value: "inactive", label: "ไม่ใช้งาน" },
  { value: "blocked", label: "ถูกบล็อก" },
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

export default function GolfMembersPage() {
  const { canWrite } = useGolfRole();
  const writable = canWrite("members");
  const { members } = useGolfData();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeF, setTypeF] = useState("");
  const [tierF, setTierF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [detail, setDetail] = useState<GolfMember | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // จำลอง initial load → skeleton
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  }, []);

  const kpi = useMemo(() => {
    const withPlan = members.filter((m) => m.membership_plan_id).length;
    const fromLine = members.filter((m) => m.line_user_id).length;
    const risky = members.filter((m) => m.no_show_count >= 3).length;
    return { total: members.length, withPlan, fromLine, risky };
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (typeF && m.member_type !== typeF) return false;
      if (tierF && m.tier !== tierF) return false;
      if (statusF && m.status !== statusF) return false;
      if (q) {
        const hay = `${m.display_name} ${m.member_no ?? ""} ${m.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, search, typeF, tierF, statusF]);

  const hasFilter = !!(search || typeF || tierF || statusF);

  return (
    <GolfShell
      title="สมาชิก/ลูกค้า"
      description="ฐานลูกค้าอัตโนมัติจาก LINE + walk-in — ดูประวัติเล่น/no-show, แต้มสะสม, สมาชิกภาพในที่เดียว"
      icon={<Users className="h-6 w-6" />}
      actions={
        writable ? (
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            เพิ่มลูกค้า walk-in
          </Button>
        ) : undefined
      }
    >
      {!writable && (
        <AccessLockBanner>
          โหมดดูอย่างเดียว — เพิ่ม/แก้ลูกค้าต้องมีสิทธิ์พนักงานขึ้นไป
        </AccessLockBanner>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="ลูกค้าทั้งหมด"
          value={fmtNum(kpi.total)}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<BadgeCheck className="h-4 w-4" />}
          label="สมาชิกมีแพ็กเกจ"
          value={fmtNum(kpi.withPlan)}
          sub="รายได้ recurring"
          tone="primary"
          valueColored
        />
        <StatCard
          icon={<MessageCircle className="h-4 w-4" />}
          label="เข้ามาจาก LINE"
          value={fmtNum(kpi.fromLine)}
          sub="ทำ CRM/โปรฯ ต่อได้"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<UserX className="h-4 w-4" />}
          label="เสี่ยง no-show สูง"
          value={fmtNum(kpi.risky)}
          sub={kpi.risky > 0 ? "no-show ≥ 3 ครั้ง" : "ไม่มี"}
          tone={kpi.risky > 0 ? "warning" : "neutral"}
          valueColored
        />
      </div>

      {/* filter bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหาชื่อ / รหัส / เบอร์โทร"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={typeF} onChange={setTypeF} options={TYPE_OPTIONS} />
          <CustomSelect value={tierF} onChange={setTierF} options={TIER_FILTER_OPTIONS} />
          <CustomSelect value={statusF} onChange={setStatusF} options={STATUS_OPTIONS} />
        </div>
      </div>

      {/* table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ลูกค้า</TableHead>
            <TableHead align="center">ประเภท</TableHead>
            <TableHead align="center">ระดับ</TableHead>
            <TableHead align="right">แต้มสะสม</TableHead>
            <TableHead align="center">no-show</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={6} />
          ) : filtered.length === 0 ? (
            <TableEmpty colSpan={6}>
              <div className="flex flex-col items-center gap-2 py-8">
                <Users className="h-8 w-8 text-gray-300" />
                <span>{hasFilter ? "ไม่พบลูกค้าตามเงื่อนไข" : "ยังไม่มีลูกค้าในระบบ"}</span>
                <span className="text-xs text-gray-400">
                  ลูกค้าจะเข้ามาเองเมื่อแอด LINE OA — หรือเพิ่ม walk-in ด้วยตนเอง
                </span>
                {hasFilter ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setTypeF("");
                      setTierF("");
                      setStatusF("");
                    }}
                  >
                    ล้างตัวกรอง
                  </Button>
                ) : (
                  writable && (
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                      <UserPlus className="mr-1.5 h-4 w-4" />
                      เพิ่มลูกค้า walk-in
                    </Button>
                  )
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((m) => (
              <TableRow key={m.id} clickable onClick={() => setDetail(m)}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={m.display_name} className="h-9 w-9 text-xs" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900">{m.display_name}</span>
                        {m.line_user_id && (
                          <StatusBadge tone="info" className="gap-1">
                            <MessageCircle className="h-3 w-3" />
                            LINE
                          </StatusBadge>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 tabular-nums">
                        {m.member_no ?? "ลูกค้าทั่วไป"}
                        {m.phone ? ` · ${m.phone}` : ""}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell align="center">
                  <MemberTypeBadge type={m.member_type} />
                </TableCell>
                <TableCell align="center">
                  {m.tier === "none" ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <StatusBadge tone={TIER_TONE[m.tier]}>{TIER_LABEL[m.tier]}</StatusBadge>
                  )}
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  <span className="inline-flex items-center gap-1 text-gray-900">
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    {fmtNum(m.points_balance)}
                  </span>
                </TableCell>
                <TableCell
                  align="center"
                  className={m.no_show_count >= 3 ? "tabular-nums font-medium text-red-600" : "tabular-nums text-gray-600"}
                >
                  {fmtNum(m.no_show_count)}
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={STATUS_META[m.status].tone}>
                    {STATUS_META[m.status].label}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <MemberDetailDialog
        member={detail}
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
      />
      <AddWalkInDialog open={addOpen} onOpenChange={setAddOpen} />
    </GolfShell>
  );
}

// ── เพิ่มลูกค้า walk-in (ฟอร์มสั้น — addMember mutator) ──
function AddWalkInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addMember } = useGolfData();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<GolfMemberType>("guest");
  const [err, setErr] = useState(false);

  // reset เมื่อเปิด
  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setType("guest");
      setErr(false);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErr(true);
      return;
    }
    addMember({
      profile_id: null,
      line_user_id: null,
      display_name: name.trim(),
      full_name: name.trim(),
      phone: phone.trim() || null,
      member_type: type,
      member_no: null,
      membership_plan_id: null,
      membership_expires_at: null,
      tier: "none",
      points_balance: 0,
      status: "active",
      no_show_count: 0,
      notes: "เพิ่มด้วยตนเอง (walk-in)",
    });
    notify.created(`เพิ่มลูกค้า ${name.trim()} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>เพิ่มลูกค้า walk-in</DialogTitle>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="wi-name">ชื่อลูกค้า *</Label>
                <Input
                  id="wi-name"
                  className={`mt-1 ${err && !name.trim() ? "border-red-500 focus:ring-red-500" : ""}`}
                  placeholder="เช่น คุณสมชาย ใจดี"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {err && !name.trim() && (
                  <p className="mt-1 text-xs text-red-600">กรุณากรอกชื่อลูกค้า</p>
                )}
              </div>
              <div>
                <Label htmlFor="wi-phone">เบอร์โทร</Label>
                <Input
                  id="wi-phone"
                  className="mt-1"
                  placeholder="08x-xxx-xxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="wi-type">ประเภท</Label>
                <CustomSelect
                  className="mt-1"
                  value={type}
                  onChange={(v) => setType(v as GolfMemberType)}
                  options={[
                    { value: "guest", label: "บุคคลทั่วไป" },
                    { value: "member", label: "สมาชิก" },
                    { value: "vip", label: "VIP" },
                  ]}
                />
                <p className="mt-1 text-xs text-gray-500">
                  ตั้งระดับ/แพ็กเกจสมาชิกได้ภายหลังในหน้ารายละเอียดลูกค้า
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit">
              <UserPlus className="mr-1.5 h-4 w-4" /> เพิ่มลูกค้า
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
