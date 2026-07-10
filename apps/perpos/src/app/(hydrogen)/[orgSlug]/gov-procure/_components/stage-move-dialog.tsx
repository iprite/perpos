"use client";

// stage-move-dialog.tsx — เลื่อน stage ของงาน (shared: ใช้โดย Detail + Pipeline)
// spec §4.1 (P1-b): เลือก stage ใหม่ → ThaiDatePicker วันหมุด pre-fill = TODAY_ISO (1 คลิกยืนยัน)
//   + soft path "เลื่อนโดยไม่ระบุวัน" (secondary — override, ปล่อยหมุดว่าง + stage_manual_override=true)
//   + soft-warning ถ้าข้ามหมุด (ไม่ block) · closed = ปุ่มปิดงานตรง ๆ (ไม่ถามวัน — ไม่ผูกหมุด)
// mirror hotel/_components dialog pattern (Dialog + DialogBody + toast ทุก mutation)

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useData } from "./gov-provider";
import { TODAY_ISO } from "./format";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/gov-procure/stage";
import type { GovProcureOrder, Stage } from "@/lib/gov-procure/types";

/** milestone date field ที่ผูกกับแต่ละ stage (spec §4 group F) — quotation/closed ไม่ผูกวัน */
const STAGE_MILESTONE_FIELD: Partial<Record<Stage, keyof GovProcureOrder>> = {
  contracted: "contract_date",
  procuring: "payment_order_date",
  delivered: "delivery_date",
  paid: "receipt_date",
};

const STAGE_MILESTONE_LABEL: Partial<Record<Stage, string>> = {
  contracted: "วันเซ็นสัญญา",
  procuring: "วันสั่งซื้อ/ชำระซัพพลายเออร์",
  delivered: "วันส่งมอบ",
  paid: "วันรับเช็ค/รับเงิน",
};

export function StageMoveDialog({
  order,
  open,
  onOpenChange,
}: {
  order: GovProcureOrder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { updateStage, closeOrder } = useData();

  const [target, setTarget] = useState<Stage>("contracted");
  const [milestoneDate, setMilestoneDate] = useState<string>(TODAY_ISO);
  const [saving, setSaving] = useState(false);

  // seed target = stage ถัดไป (หรือ stage ปัจจุบันถ้าอยู่ท้ายสุด) ทุกครั้งที่เปิด/เปลี่ยน order
  useEffect(() => {
    if (!open || !order) return;
    const idx = STAGE_ORDER.indexOf(order.stage);
    const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
    setTarget(next);
    setMilestoneDate(TODAY_ISO);
  }, [open, order]);

  const milestoneField = STAGE_MILESTONE_FIELD[target];
  const milestoneLabel = STAGE_MILESTONE_LABEL[target];

  // soft-warning: เลื่อนไป stage ที่ "ข้ามหมุด" ก่อนหน้าที่ยังไม่กรอก (ไม่ block — spec §4.1)
  const skipWarning = useMemo(() => {
    if (!order) return null;
    const targetIdx = STAGE_ORDER.indexOf(target);
    const missing: string[] = [];
    for (const s of STAGE_ORDER) {
      const sIdx = STAGE_ORDER.indexOf(s);
      if (sIdx >= targetIdx) break;
      const f = STAGE_MILESTONE_FIELD[s];
      if (f && !order[f]) missing.push(STAGE_MILESTONE_LABEL[s] ?? STAGE_LABELS[s]);
    }
    return missing.length > 0 ? missing : null;
  }, [order, target]);

  if (!order) return null;

  const isClosed = target === "closed";
  const isQuotation = target === "quotation";

  async function confirm(withDate: boolean) {
    if (!order) return;
    setSaving(true);
    try {
      if (isClosed) {
        await closeOrder(order.id);
        toast.success(`ปิดงาน ${order.qt_reference ?? order.product_description ?? ""} แล้ว`);
      } else if (withDate && milestoneField && milestoneDate) {
        await updateStage(order.id, target, { milestone_date: milestoneDate });
        toast.success(`เลื่อนงานเป็น "${STAGE_LABELS[target]}" แล้ว`);
      } else {
        await updateStage(order.id, target, { skip_date: true });
        toast.success(`เลื่อนงานเป็น "${STAGE_LABELS[target]}" (ไม่ระบุวัน)`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "เลื่อนสถานะไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              เลื่อนสถานะงาน
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Text className="text-xs text-gray-400">งาน</Text>
              <Text className="mt-0.5 text-sm font-medium text-gray-900">
                {order.product_description ?? order.qt_reference ?? "—"}
              </Text>
              <Text className="mt-0.5 text-xs text-gray-500">
                สถานะปัจจุบัน: {STAGE_LABELS[order.stage]}
              </Text>
            </div>

            {/* เลือก stage ปลายทาง — 6 ปุ่ม (a11y: label ควบสี, keyboard-accessible) */}
            <div>
              <Label>เลื่อนเป็น</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STAGE_ORDER.map((s) => {
                  const active = target === s;
                  return (
                    <Button
                      key={s}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className="justify-start whitespace-nowrap text-xs"
                      onClick={() => setTarget(s)}
                    >
                      {STAGE_LABELS[s]}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* วันหมุด — pre-fill today (P1-b), ยกเว้น quotation/closed ที่ไม่ผูกหมุด */}
            {milestoneField && milestoneLabel && (
              <div>
                <Label htmlFor="stage-milestone-date">{milestoneLabel}</Label>
                <ThaiDatePicker
                  value={milestoneDate}
                  onChange={setMilestoneDate}
                  placeholder="เลือกวันหมุด"
                />
                <Text className="mt-1 text-xs text-gray-400">
                  ตั้งค่าเป็นวันนี้ให้แล้ว — กดยืนยันได้เลย หรือแก้วันตามจริง
                </Text>
              </div>
            )}

            {isClosed && (
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <Text className="text-xs text-green-800">
                  ปิดงานเป็นการทำด้วยตนเอง — คอมมิชชั่นจ่ายเป็นขั้นตอนแยก
                  ไม่จำเป็นต้องจ่ายก่อนปิดงาน
                </Text>
              </div>
            )}

            {isQuotation && (
              <Text className="text-xs text-gray-400">
                สถานะเสนอราคาไม่ผูกวันหมุด — ใช้เมื่อย้อนงานกลับ (เช่น รอผลประมูล)
              </Text>
            )}

            {/* soft-warning ข้ามหมุด (ไม่ block) */}
            {skipWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <Text className="text-xs font-medium text-amber-800">
                    ยังไม่ได้ระบุ: {skipWarning.join(" · ")}
                  </Text>
                  <Text className="mt-0.5 text-xs text-amber-700">
                    เลื่อนข้ามหมุดได้ (งานภาครัฐย้อน/ข้ามได้) — ยืนยันเลื่อนต่อได้เลย
                  </Text>
                </div>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          {/* soft path: เลื่อนโดยไม่ระบุวัน (เฉพาะ stage ที่มีหมุด) */}
          {milestoneField && (
            <Button variant="secondary" disabled={saving} onClick={() => confirm(false)}>
              เลื่อนโดยไม่ระบุวัน
            </Button>
          )}
          <Button disabled={saving} onClick={() => confirm(true)}>
            {saving ? "กำลังบันทึก…" : isClosed ? "ปิดงาน" : "ยืนยันเลื่อน"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
