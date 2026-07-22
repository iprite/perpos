"use client";

// payments/record-payment-dialog.tsx — บันทึกรับชำระ / คืนเงิน
// v2 decision (binding): "ไม่มี hard block เรื่องเงิน" — หน้านี้แค่บันทึกและอัปเดตยอดคงค้าง
// ห้ามเพิ่มเงื่อนไขบล็อกสถานะออเดอร์จากยอดชำระเด็ดขาด

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { notify } from "@/lib/toast";
import { PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL } from "../_fixtures/labels";
import type { MattiiOrder, PaymentMethod, PaymentType } from "../_fixtures/types";
import { fmtMoney, todayIso, useMattiiData } from "../_components";

export interface RecordPaymentInput {
  orderId: string;
  paymentType: PaymentType;
  method: PaymentMethod;
  amount: number;
  paidOn: string;
  note: string;
}

const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({
  value: m as string,
  label: PAYMENT_METHOD_LABEL[m],
}));

const RECEIVE_TYPE_OPTIONS = (["deposit", "balance", "full"] as PaymentType[]).map((t) => ({
  value: t as string,
  label: PAYMENT_TYPE_LABEL[t],
}));

export function RecordPaymentDialog({
  open,
  onOpenChange,
  defaultOrderId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultOrderId?: string | null;
  onSubmit: (input: RecordPaymentInput) => void;
}) {
  const { orders, customerOf } = useMattiiData();

  const [direction, setDirection] = useState<"receive" | "refund">("receive");
  const [orderId, setOrderId] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("deposit");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const selectedOrder: MattiiOrder | undefined = orders.find((o) => o.id === orderId);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setDirection("receive");
    setPaymentType("deposit");
    setMethod("transfer");
    setPaidOn(todayIso());
    setNote("");
    setOrderId(defaultOrderId ?? "");
    setAmount("");
  }, [open, defaultOrderId]);

  // เลือกออเดอร์แล้วเติมยอดคงค้างให้อัตโนมัติ (แก้ได้)
  useEffect(() => {
    if (!open || !selectedOrder) return;
    setAmount(selectedOrder.outstanding_amount > 0 ? String(selectedOrder.outstanding_amount) : "");
  }, [open, selectedOrder]);

  const amountNum = Number(amount);

  function handleSave() {
    setTouched(true);
    if (!orderId) {
      notify.error("เลือกออเดอร์ที่ต้องการบันทึกก่อน");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      notify.error("กรอกจำนวนเงินให้ถูกต้อง");
      return;
    }
    onSubmit({
      orderId,
      paymentType: direction === "refund" ? "refund" : paymentType,
      method,
      amount: amountNum,
      paidOn,
      note,
    });
    onOpenChange(false);
  }

  const orderOptions = [
    { value: "", label: "— เลือกออเดอร์ —" },
    ...orders
      .filter((o) => o.status !== "cancelled")
      .sort((a, b) => b.outstanding_amount - a.outstanding_amount)
      .map((o) => ({
        value: o.id,
        label: `${o.order_no} · ${customerOf(o.customer_id)?.display_name ?? "—"} · คงค้าง ${fmtMoney(o.outstanding_amount)}`,
      })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>บันทึกรับชำระ / คืนเงิน</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>ประเภทรายการ</Label>
              <div className="mt-1">
                <SegmentedControl
                  value={direction}
                  onChange={setDirection}
                  fullWidth
                  options={[
                    { value: "receive", label: "รับเงิน", activeClassName: "bg-green-600" },
                    { value: "refund", label: "คืนเงิน", activeClassName: "bg-red-600" },
                  ]}
                />
              </div>
            </div>

            <div>
              <Label>ออเดอร์ *</Label>
              <CustomSelect
                value={orderId}
                onChange={setOrderId}
                options={orderOptions}
                className="mt-1"
              />
              {touched && !orderId && (
                <Text className="mt-1 text-xs text-red-600">กรุณาเลือกออเดอร์</Text>
              )}
              {selectedOrder && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <Text className="text-xs text-gray-600">
                    ยอดรวม{" "}
                    <span className="tabular-nums">{fmtMoney(selectedOrder.total_amount)}</span> ·
                    ชำระแล้ว{" "}
                    <span className="tabular-nums">{fmtMoney(selectedOrder.paid_amount)}</span> ·
                    คงค้าง{" "}
                    <span
                      className={
                        selectedOrder.outstanding_amount > 0
                          ? "tabular-nums text-red-600"
                          : "tabular-nums"
                      }
                    >
                      {fmtMoney(selectedOrder.outstanding_amount)}
                    </span>
                  </Text>
                  {selectedOrder.paid_amount === 0 && (
                    <StatusBadge tone="warning">ยังไม่ได้รับชำระ</StatusBadge>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {direction === "receive" && (
                <div className="min-w-0">
                  <Label>ชนิดการชำระ</Label>
                  <CustomSelect
                    value={paymentType}
                    onChange={(v) => setPaymentType(v as PaymentType)}
                    options={RECEIVE_TYPE_OPTIONS}
                    className="mt-1"
                  />
                </div>
              )}
              <div className="min-w-0">
                <Label>วิธีชำระ</Label>
                <CustomSelect
                  value={method}
                  onChange={(v) => setMethod(v as PaymentMethod)}
                  options={METHOD_OPTIONS}
                  className="mt-1"
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="mt-pay-amount">จำนวนเงิน (฿) *</Label>
                <Input
                  id="mt-pay-amount"
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="เช่น 490"
                  className="mt-1"
                />
              </div>
              <div className="min-w-0">
                <Label>วันที่ชำระ</Label>
                <div className="mt-1">
                  <ThaiDatePicker value={paidOn} onChange={setPaidOn} placeholder="เลือกวันที่" />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="mt-pay-note">โน้ต</Label>
              <Input
                id="mt-pay-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น โอนผ่านพร้อมเพย์ ลูกค้าส่งสลิปในแชท"
                className="mt-1"
              />
            </div>

            <Text className="text-xs text-gray-400">
              ระบบบันทึกการชำระเงินและอัปเดตยอดคงค้างเท่านั้น — ไม่บล็อกการเดินสถานะออเดอร์
            </Text>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave}>บันทึกรายการ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
