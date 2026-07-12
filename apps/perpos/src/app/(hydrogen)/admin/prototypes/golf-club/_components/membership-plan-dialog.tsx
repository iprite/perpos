"use client";

// membership-plan-dialog.tsx — สร้าง/แก้ไขแพ็กเกจสมาชิกรายปี [D3]
// fields: tier/ราคาปี/duration/ส่วนลด%/ตะกร้าฟรี/แต้ม×/perks (advance/รถ/แคดดี้)/สถานะ
// tier = CustomSelect · SegmentedControl สำหรับ boolean (2 ตัวเลือก) · เงิน tabular
// mutators: addPlan / updatePlan / deletePlan

import { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { notify } from "@/lib/toast";
import { useGolfData } from "./data-context";
import type { GolfMembershipPlan, GolfTier } from "../_fixtures/types";

const TIER_OPTIONS: { value: GolfTier; label: string }[] = [
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
];

const YES_NO: { value: "yes" | "no"; label: string }[] = [
  { value: "yes", label: "มี" },
  { value: "no", label: "ไม่มี" },
];

interface FormState {
  name: string;
  tier: GolfTier;
  price: string;
  duration: string;
  discount: string;
  buckets: string;
  multiplier: string;
  advanceDays: string;
  freeCart: boolean;
  freeCaddie: boolean;
  active: boolean;
}

const EMPTY: FormState = {
  name: "",
  tier: "silver",
  price: "",
  duration: "12",
  discount: "10",
  buckets: "0",
  multiplier: "1",
  advanceDays: "7",
  freeCart: false,
  freeCaddie: false,
  active: true,
};

function toForm(p: GolfMembershipPlan): FormState {
  const perks = (p.perks ?? {}) as Record<string, unknown>;
  return {
    name: p.name,
    tier: p.tier === "none" ? "silver" : p.tier,
    price: String(p.price_per_year),
    duration: String(p.duration_months),
    discount: p.green_fee_discount_pct != null ? String(p.green_fee_discount_pct) : "0",
    buckets: p.free_buckets_per_month != null ? String(p.free_buckets_per_month) : "0",
    multiplier: p.points_multiplier != null ? String(p.points_multiplier) : "1",
    advanceDays: perks.advance_booking_days != null ? String(perks.advance_booking_days) : "7",
    freeCart: perks.free_cart === true,
    freeCaddie: perks.free_caddie === true,
    active: p.is_active,
  };
}

export function MembershipPlanDialog({
  plan,
  open,
  onOpenChange,
}: {
  /** null = โหมดสร้างใหม่ */
  plan: GolfMembershipPlan | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addPlan, updatePlan, deletePlan } = useGolfData();
  const [f, setF] = useState<FormState>(EMPTY);
  const [err, setErr] = useState(false);

  // hooks ก่อน early-return — seed เมื่อเปิด
  useEffect(() => {
    if (open) {
      setF(plan ? toForm(plan) : EMPTY);
      setErr(false);
    }
  }, [open, plan]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(f.price);
    const duration = Number(f.duration);
    if (!f.name.trim() || !Number.isFinite(price) || price <= 0 || duration <= 0) {
      setErr(true);
      return;
    }
    const payload = {
      name: f.name.trim(),
      tier: f.tier,
      price_per_year: price,
      duration_months: duration,
      green_fee_discount_pct: Number(f.discount) || 0,
      free_buckets_per_month: Number(f.buckets) || 0,
      points_multiplier: Number(f.multiplier) || 1,
      perks: {
        advance_booking_days: Number(f.advanceDays) || 0,
        free_cart: f.freeCart,
        free_caddie: f.freeCaddie,
      },
      is_active: f.active,
    };
    if (plan) {
      updatePlan(plan.id, payload);
      notify.saved(`บันทึกแพ็กเกจ ${payload.name} แล้ว`);
    } else {
      addPlan(payload);
      notify.created(`สร้างแพ็กเกจ ${payload.name} แล้ว`);
    }
    onOpenChange(false);
  }

  function handleDelete() {
    if (!plan) return;
    deletePlan(plan.id);
    notify.deleted(`ลบแพ็กเกจ ${plan.name} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{plan ? "แก้ไขแพ็กเกจสมาชิก" : "สร้างแพ็กเกจสมาชิก"}</DialogTitle>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="pl-name">ชื่อแพ็กเกจ *</Label>
                <Input
                  id="pl-name"
                  className={`mt-1 ${err && !f.name.trim() ? "border-red-500 focus:ring-red-500" : ""}`}
                  placeholder="เช่น สมาชิก Gold รายปี"
                  value={f.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pl-tier">ระดับ (tier)</Label>
                <CustomSelect
                  className="mt-1"
                  value={f.tier}
                  onChange={(v) => set("tier", v as GolfTier)}
                  options={TIER_OPTIONS}
                />
              </div>
              <div>
                <Label htmlFor="pl-duration">ระยะเวลา (เดือน) *</Label>
                <Input
                  id="pl-duration"
                  type="number"
                  min={1}
                  className="mt-1"
                  value={f.duration}
                  onChange={(e) => set("duration", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pl-price">ราคา/ปี (฿) *</Label>
                <Input
                  id="pl-price"
                  type="number"
                  min={0}
                  className={`mt-1 ${err && !(Number(f.price) > 0) ? "border-red-500 focus:ring-red-500" : ""}`}
                  value={f.price}
                  onChange={(e) => set("price", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pl-discount">ส่วนลดกรีนฟี (%)</Label>
                <Input
                  id="pl-discount"
                  type="number"
                  min={0}
                  max={100}
                  className="mt-1"
                  value={f.discount}
                  onChange={(e) => set("discount", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pl-buckets">ตะกร้าลูกฟรี/เดือน</Label>
                <Input
                  id="pl-buckets"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={f.buckets}
                  onChange={(e) => set("buckets", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pl-mult">ตัวคูณแต้ม (×)</Label>
                <Input
                  id="pl-mult"
                  type="number"
                  min={1}
                  className="mt-1"
                  value={f.multiplier}
                  onChange={(e) => set("multiplier", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pl-advance">จองล่วงหน้าได้ (วัน)</Label>
                <Input
                  id="pl-advance"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={f.advanceDays}
                  onChange={(e) => set("advanceDays", e.target.value)}
                />
              </div>

              <div>
                <Label>รถกอล์ฟฟรี</Label>
                <SegmentedControl
                  className="mt-1"
                  value={f.freeCart ? "yes" : "no"}
                  onChange={(v) => set("freeCart", v === "yes")}
                  options={YES_NO}
                  fullWidth
                />
              </div>
              <div>
                <Label>แคดดี้ฟรี</Label>
                <SegmentedControl
                  className="mt-1"
                  value={f.freeCaddie ? "yes" : "no"}
                  onChange={(v) => set("freeCaddie", v === "yes")}
                  options={YES_NO}
                  fullWidth
                />
              </div>
              <div className="sm:col-span-2">
                <Label>สถานะแพ็กเกจ</Label>
                <SegmentedControl
                  className="mt-1"
                  value={f.active ? "active" : "inactive"}
                  onChange={(v) => set("active", v === "active")}
                  options={[
                    { value: "active", label: "เปิดขาย" },
                    { value: "inactive", label: "ปิด" },
                  ]}
                  fullWidth
                />
              </div>

              {err && (
                <p className="text-xs text-red-600 sm:col-span-2">
                  กรุณากรอกชื่อแพ็กเกจ ราคา/ปี และระยะเวลาให้ถูกต้อง
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            {plan && (
              <Button type="button" variant="destructive" className="mr-auto" onClick={handleDelete}>
                <Trash2 className="mr-1.5 h-4 w-4" /> ลบแพ็กเกจ
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit">
              <Save className="mr-1.5 h-4 w-4" /> บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
