"use client";

// production-dialogs.tsx — dialog ของหน้างานผลิต
//  · QcFailDialog — เปิดเฉพาะตอน "QC ไม่ผ่าน" (happy path "QC ผ่าน" = 1 กด ไม่เปิดฟอร์ม)
//    🔒 ช่อง "มูลค่าของเสีย" แสดงเฉพาะเจ้าของ (§2.3) — role อื่นตัดทั้งช่อง ไม่ใช่ปิดการใช้งาน
//  · QueueDialog — action รอง: เปลี่ยนเครื่อง / เลื่อนลำดับคิว
//  · JobDetailDialog — รายละเอียดงานผลิต (ของที่ไม่จำเป็นต้องเห็นบนการ์ด)

import { useState } from "react";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/typography";
import { QC_DEFECT_TYPE_LABEL } from "../_fixtures/labels";
import type { MattiiMachine, QcDefectType } from "../_fixtures/types";
import { Field, OrderStatusBadge, fmtDateTH, fmtNum, useMattiiRole } from "../_components";
import type { ProductionCard } from "./use-production-state";

const DEFECT_OPTIONS = (Object.keys(QC_DEFECT_TYPE_LABEL) as QcDefectType[]).map((k) => ({
  value: k,
  label: QC_DEFECT_TYPE_LABEL[k],
}));

export function QcFailDialog({
  card,
  open,
  onOpenChange,
  onSubmit,
}: {
  card: ProductionCard;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: {
    defectType: QcDefectType;
    defectQty: number;
    defectNote: string;
    defectCost: number;
  }) => void;
}) {
  const { isOwner } = useMattiiRole();
  const [defectType, setDefectType] = useState<QcDefectType>("color_off");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");

  const qtyNum = Number(qty);
  const invalidQty = !Number.isFinite(qtyNum) || qtyNum < 1 || qtyNum > card.pieces;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>บันทึก QC ไม่ผ่าน · {card.order.order_no}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <Text className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              บันทึกแล้วระบบจะสร้างงานพิมพ์ซ้ำและส่งออเดอร์กลับไปสถานะ “กำลังพิมพ์” อัตโนมัติ
            </Text>

            <div>
              <Label>ข้อบกพร่องที่พบ *</Label>
              <CustomSelect
                value={defectType}
                onChange={(v) => setDefectType(v as QcDefectType)}
                options={DEFECT_OPTIONS}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="qc-qty">
                จำนวนผืนที่เสีย * (ทั้งออเดอร์ {fmtNum(card.pieces)} ผืน)
              </Label>
              <Input
                id="qc-qty"
                type="number"
                min={1}
                max={card.pieces}
                className="mt-1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              {invalidQty && (
                <Text className="mt-1 text-xs text-red-600">
                  ระบุจำนวนระหว่าง 1 ถึง {fmtNum(card.pieces)} ผืน
                </Text>
              )}
            </div>

            <div>
              <Label htmlFor="qc-note">รายละเอียด (ไม่บังคับ)</Label>
              <Textarea
                id="qc-note"
                rows={3}
                className="mt-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น สีพื้นเพี้ยนจากไฟล์ต้นฉบับชัดเจน"
              />
              <Text className="mt-1 text-xs text-gray-500">
                แนบรูปได้ในระบบจริง — ตัวอย่างนี้ยังไม่เปิดการอัปโหลด
              </Text>
            </div>

            {isOwner && (
              <div>
                <Label htmlFor="qc-cost">มูลค่าของเสียโดยประมาณ (฿)</Label>
                <Input
                  id="qc-cost"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="เช่น 430"
                />
                <Text className="mt-1 text-xs text-gray-500">
                  ใช้คิดต้นทุนของเสียในรายงานกำไร — เห็นเฉพาะเจ้าของ
                </Text>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            variant="destructive"
            disabled={invalidQty}
            onClick={() => {
              onSubmit({
                defectType,
                defectQty: qtyNum,
                defectNote: note.trim(),
                defectCost: Number(cost) > 0 ? Number(cost) : 0,
              });
              onOpenChange(false);
            }}
          >
            บันทึกและสั่งพิมพ์ซ้ำ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QueueDialog({
  card,
  machines,
  open,
  onOpenChange,
  onSetMachine,
  onMoveFront,
  onMoveBack,
}: {
  card: ProductionCard;
  machines: MattiiMachine[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSetMachine: (machineId: string) => void;
  onMoveFront: () => void;
  onMoveBack: () => void;
}) {
  const [machineId, setMachineId] = useState(card.machine?.id ?? "");
  const options = machines.map((m) => ({
    value: m.id,
    label: `${m.code} · ${m.name}`,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>จัดคิว / เปลี่ยนเครื่อง · {card.order.order_no}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>เครื่องที่ใช้ผลิต</Label>
              <CustomSelect
                value={machineId}
                onChange={setMachineId}
                options={options}
                className="mt-1"
              />
              {machines.find((m) => m.id === machineId)?.status === "maintenance" && (
                <Text className="mt-1 text-xs text-amber-700">
                  เครื่องนี้กำลังซ่อมบำรุง — ถ้าเลือกไว้ งานอาจต้องรอจนเครื่องกลับมาใช้ได้
                </Text>
              )}
            </div>
            <div>
              <Label>ลำดับในคิว</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    onMoveFront();
                    onOpenChange(false);
                  }}
                >
                  <ArrowUpToLine className="mr-1.5 h-4 w-4" /> ดันขึ้นหัวคิว
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    onMoveBack();
                    onOpenChange(false);
                  }}
                >
                  <ArrowDownToLine className="mr-1.5 h-4 w-4" /> เลื่อนไปท้ายคิว
                </Button>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          <Button
            disabled={!machineId || machineId === card.machine?.id}
            onClick={() => {
              onSetMachine(machineId);
              onOpenChange(false);
            }}
          >
            บันทึกเครื่องที่ใช้
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function JobDetailDialog({
  card,
  open,
  onOpenChange,
}: {
  card: ProductionCard;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>รายละเอียดงานผลิต · {card.order.order_no}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <OrderStatusBadge status={card.order.status} />
              {!card.cfConfirmed ? (
                <StatusBadge tone="danger">ยังไม่มีไฟล์ที่ลูกค้ายืนยัน</StatusBadge>
              ) : card.cfVersionNo !== null ? (
                <StatusBadge tone="success">ไฟล์ที่ยืนยัน v{card.cfVersionNo}</StatusBadge>
              ) : (
                <StatusBadge tone="success">ยืนยันแล้ว (เวอร์ชันล่าสุด)</StatusBadge>
              )}
              {card.hasReprint && <StatusBadge tone="warning">เคยพิมพ์ซ้ำ</StatusBadge>}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="ลูกค้า">{card.customer?.display_name ?? "—"}</Field>
              <Field label="กำหนดส่ง">
                <span className="tabular-nums">{fmtDateTH(card.order.due_date)}</span>
              </Field>
              <Field label="เครื่องที่ใช้">{card.machine?.name ?? "ยังไม่ระบุ"}</Field>
              <Field label="ไฟล์ลายที่จะพิมพ์">
                <span className="font-mono text-xs">{card.cfFileName ?? "—"}</span>
              </Field>
              <Field label="ผ้าที่ต้องใช้">
                <span className="tabular-nums">{fmtNum(card.fabricSqm, 2)} ตร.ม.</span>
              </Field>
              <Field label="ชนิดผ้า">{card.fabricType ?? "—"}</Field>
              <Field label="จำนวนผืนรวม">
                <span className="tabular-nums">{fmtNum(card.pieces)}</span>
              </Field>
              <Field label="กล่องที่ใช้แพ็ค">
                <span className="tabular-nums">{fmtNum(card.packageCount)}</span>
              </Field>
            </div>

            <div>
              <div className="mb-2 px-1 text-sm font-semibold text-gray-900">
                รายการพรมในออเดอร์
              </div>
              <ul className="space-y-2">
                {card.items.map((it) => (
                  <li
                    key={it.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{it.item_name}</div>
                      <div className="text-xs text-gray-500">
                        ลาย {it.pattern_name ?? "—"} · {it.size_label} · {it.fabric_type ?? "—"}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-gray-900">
                      {fmtNum(it.qty)} ผืน
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {card.order.note && (
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium text-gray-500">โน้ตจากฝ่ายขาย</div>
                <Text className="mt-0.5 text-sm text-gray-900">{card.order.note}</Text>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
