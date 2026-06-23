"use client";

// payment-dialog.tsx — รับชำระเงิน (shared) เรียกจาก booking detail / payments / daily
// kind/method/amount + paid_at + reference · validate amount>0 · default amount = ยอดค้าง

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
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
import { useHotelData } from "./data-context";
import { computeBalance, paymentsOf } from "./money";
import { fmtMoney, TODAY_ISO } from "./format";
import { PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL } from "./badges";
import type { Booking, PaymentKind, PaymentMethod } from "../_fixtures/types";

const KIND_OPTIONS = (Object.keys(PAYMENT_KIND_LABEL) as PaymentKind[]).map((k) => ({
  value: k,
  label: PAYMENT_KIND_LABEL[k],
}));
const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({
  value: m,
  label: PAYMENT_METHOD_LABEL[m],
}));

export function PaymentDialog({
  open,
  onOpenChange,
  booking,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** booking ที่จะรับชำระ (ถ้า null = ยังไม่เลือก) */
  booking: Booking | null;
}) {
  const { payments, addPayment } = useHotelData();
  const balance = booking ? computeBalance(booking, paymentsOf(booking.id, payments)) : 0;

  const [kind, setKind] = useState<PaymentKind>("balance");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(TODAY_ISO);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  // reset เมื่อเปิดใหม่
  const key = `${open}-${booking?.id}`;
  const [lastKey, setLastKey] = useState(key);
  if (open && key !== lastKey) {
    setLastKey(key);
    setKind(balance > 0 ? "balance" : "extra");
    setMethod("cash");
    setAmount(balance > 0 ? String(balance) : "");
    setPaidAt(TODAY_ISO);
    setReference("");
    setNote("");
  }

  function handleSubmit() {
    if (!booking) return toast.error("ไม่พบการจอง");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("กรุณากรอกยอดเงินที่ถูกต้อง");
    addPayment({
      booking_id: booking.id,
      kind,
      method,
      amount: amt,
      paid_at: new Date(`${paidAt}T12:00:00.000Z`).toISOString(),
      reference: reference.trim() || null,
      note: note.trim() || null,
    });
    const sign = kind === "refund" ? "คืนเงิน" : "รับชำระ";
    toast.success(`${sign} ${fmtMoney(amt)} — ${booking.booking_code} สำเร็จ`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {kind === "refund" ? "คืนเงิน" : "รับชำระเงิน"}
            {booking ? ` — ${booking.booking_code}` : ""}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {!booking ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500">
              ยังไม่ได้เลือกการจอง
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
                แขก <span className="font-medium text-gray-900">{booking.guest_name}</span> · ยอดรวม{" "}
                {fmtMoney(booking.grand_total)} · ยอดค้าง{" "}
                <span
                  className={
                    balance > 0 ? "font-medium text-red-600" : "font-medium text-green-600"
                  }
                >
                  {fmtMoney(balance)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pay-kind">ประเภท</Label>
                  <CustomSelect
                    className="mt-1"
                    value={kind}
                    onChange={(v) => setKind(v as PaymentKind)}
                    options={KIND_OPTIONS}
                  />
                </div>
                <div>
                  <Label htmlFor="pay-method">ช่องทาง</Label>
                  <CustomSelect
                    className="mt-1"
                    value={method}
                    onChange={(v) => setMethod(v as PaymentMethod)}
                    options={METHOD_OPTIONS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pay-amount">ยอดเงิน (฿) *</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    className="mt-1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>วันที่รับชำระ</Label>
                  <ThaiDatePicker value={paidAt} onChange={setPaidAt} placeholder="เลือกวันที่" />
                </div>
              </div>

              <div>
                <Label htmlFor="pay-ref">เลขอ้างอิง / สลิป</Label>
                <Input
                  id="pay-ref"
                  className="mt-1"
                  placeholder="optional"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pay-note">หมายเหตุ</Label>
                <Input
                  id="pay-note"
                  className="mt-1"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSubmit} disabled={!booking}>
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
