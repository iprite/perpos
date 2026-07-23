"use client";

// cost-detail-dialog.tsx — 🔒 owner-only: ต้นทุนแยกหมวดของออเดอร์ + เพิ่มต้นทุนกรอกมือ
// เพิ่มแล้วกำไรของออเดอร์คำนวณใหม่ทันที (client state ของแท็บกำไร)

import { useState } from "react";
import { Plus } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { MOCK_ORG_ID } from "../_fixtures/helpers";
import { COST_CATEGORY_LABEL } from "../_fixtures/labels";
import { ESTIMATED_COST_HINT } from "../_fixtures/metrics";
import type { CostCategory, MattiiOrder, MattiiOrderCost } from "../_fixtures/types";
import { Field, SectionHeading, fmtMoney, fmtPercent } from "../_components";

const CATEGORY_OPTIONS = (Object.keys(COST_CATEGORY_LABEL) as CostCategory[]).map((k) => ({
  value: k as string,
  label: COST_CATEGORY_LABEL[k],
}));

const SOURCE_LABEL: Record<MattiiOrderCost["source"], string> = {
  auto_stock: "ตัดสต๊อกอัตโนมัติ",
  auto_shipping: "ค่าขนส่งอัตโนมัติ",
  manual: "กรอกมือ",
};

let seq = 1;

export function CostDetailDialog({
  order,
  costs,
  totalCost,
  estimated = false,
  onOpenChange,
  onAddCost,
}: {
  /** null = ปิด dialog */
  order: MattiiOrder | null;
  costs: MattiiOrderCost[];
  totalCost: number;
  /** true = ต้นทุนยังเป็นประมาณการจากรายการพรม (ออเดอร์ยังไม่เข้าสายผลิต) */
  estimated?: boolean;
  onOpenChange: (v: boolean) => void;
  onAddCost: (cost: MattiiOrderCost) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<CostCategory>("labor");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);

  const profit = order ? order.total_amount - totalCost : 0;
  const margin = order && order.total_amount > 0 ? (profit / order.total_amount) * 100 : 0;
  const invalid = !label.trim() || !(Number(amount) > 0);

  function reset() {
    setAdding(false);
    setCategory("labor");
    setLabel("");
    setAmount("");
    setTouched(false);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function handleAdd() {
    if (!order) return;
    setTouched(true);
    if (invalid) {
      notify.error("กรอกรายละเอียดและจำนวนเงินให้ครบ");
      return;
    }
    const now = new Date().toISOString();
    onAddCost({
      id: `cost-new-${Date.now()}-${seq++}`,
      org_id: MOCK_ORG_ID,
      order_id: order.id,
      cost_category: category,
      label: label.trim(),
      amount: Math.round(Number(amount) * 100) / 100,
      source: "manual",
      stock_movement_id: null,
      note: null,
      created_at: now,
      updated_at: now,
    });
    notify.created(`เพิ่มต้นทุน ${label.trim()} แล้ว — กำไรคำนวณใหม่ทันที`);
    reset();
  }

  return (
    <Dialog
      open={Boolean(order)}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>{order ? `ต้นทุน & กำไร — ${order.order_no}` : "ต้นทุน & กำไร"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {order && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="ยอดขาย">
                  <span className="font-mono tabular-nums">{fmtMoney(order.total_amount)}</span>
                </Field>
                <Field label={estimated ? "ต้นทุนรวม (ประมาณการ)" : "ต้นทุนรวม"}>
                  <span
                    className={`font-mono tabular-nums ${estimated ? "text-gray-500" : ""}`}
                  >{`${estimated ? "≈ " : ""}${fmtMoney(totalCost)}`}</span>
                </Field>
                <Field label={estimated ? "กำไรขั้นต้น (ประมาณการ)" : "กำไรขั้นต้น"}>
                  <span
                    className={
                      profit < 0
                        ? "font-mono font-semibold tabular-nums text-red-600"
                        : estimated
                          ? "font-mono font-semibold tabular-nums text-gray-500"
                          : "font-mono font-semibold tabular-nums text-green-600"
                    }
                  >
                    {`${estimated ? "≈ " : ""}${fmtMoney(profit)}`}
                  </span>
                </Field>
                <Field label={estimated ? "อัตรากำไร (ประมาณการ)" : "อัตรากำไร"}>
                  <span
                    className={
                      margin < 0
                        ? "font-mono tabular-nums text-red-600"
                        : estimated
                          ? "font-mono tabular-nums text-gray-500"
                          : "font-mono tabular-nums"
                    }
                  >
                    {`${estimated ? "≈ " : ""}${fmtPercent(margin)}`}
                  </span>
                </Field>
              </div>

              {estimated && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  ตัวเลขชุดนี้เป็น <span className="font-medium">ประมาณการ</span> —{" "}
                  {ESTIMATED_COST_HINT}
                </div>
              )}

              <div>
                <SectionHeading
                  actions={
                    !adding ? (
                      <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> เพิ่มต้นทุนกรอกมือ
                      </Button>
                    ) : undefined
                  }
                >
                  รายการต้นทุนของออเดอร์นี้
                </SectionHeading>
                <Table className="shadow-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>หมวด</TableHead>
                      <TableHead>รายละเอียด</TableHead>
                      <TableHead>ที่มา</TableHead>
                      <TableHead align="right">จำนวนเงิน</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.length === 0 ? (
                      <TableEmpty colSpan={4}>ยังไม่มีต้นทุนที่บันทึกกับออเดอร์นี้</TableEmpty>
                    ) : (
                      costs.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <StatusBadge tone="neutral">
                              {COST_CATEGORY_LABEL[c.cost_category]}
                            </StatusBadge>
                          </TableCell>
                          <TableCell wrap className="max-w-[22rem]">
                            <div className="text-gray-900">{c.label}</div>
                            {c.note && <div className="text-xs text-gray-400">{c.note}</div>}
                          </TableCell>
                          <TableCell className="text-gray-500">{SOURCE_LABEL[c.source]}</TableCell>
                          <TableCell align="right" tabular>
                            {fmtMoney(c.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {costs.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3}>รวมต้นทุน</TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(totalCost)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>

              {adding && (
                <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">เพิ่มต้นทุนกรอกมือ</div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <Label>หมวดต้นทุน</Label>
                      <CustomSelect
                        value={category}
                        onChange={(v) => setCategory(v as CostCategory)}
                        options={CATEGORY_OPTIONS}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mt-cost-label">รายละเอียด *</Label>
                      <Input
                        id="mt-cost-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="เช่น ค่าแรง OT เร่งงานด่วน"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mt-cost-amount">จำนวนเงิน (฿) *</Label>
                      <Input
                        id="mt-cost-amount"
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  {touched && invalid && (
                    <Text className="text-xs text-red-600">
                      กรอกรายละเอียดและจำนวนเงินที่มากกว่า 0
                    </Text>
                  )}
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleAdd}>
                      บันทึกต้นทุน
                    </Button>
                    <Button size="sm" variant="outline" onClick={reset}>
                      ยกเลิก
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
