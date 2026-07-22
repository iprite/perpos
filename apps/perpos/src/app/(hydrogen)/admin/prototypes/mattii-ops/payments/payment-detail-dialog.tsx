"use client";

// payments/payment-detail-dialog.tsx — รายละเอียดรายการชำระ 1 รายการ
// ปุ่มเปลี่ยนสถานะ (ยืนยันได้รับเงิน) อยู่ใน DialogFooter — ไม่มีปุ่มในแถวตาราง

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { PAYMENT_METHOD_LABEL } from "../_fixtures/labels";
import type { MattiiPayment } from "../_fixtures/types";
import {
  Field,
  PaymentStatusBadge,
  PaymentTypeBadge,
  fmtDateTH,
  fmtMoney,
  useMattiiData,
} from "../_components";
import { signedAmount } from "./summary";

export function PaymentDetailDialog({
  payment,
  canWrite,
  onOpenChange,
  onConfirmPaid,
}: {
  payment: MattiiPayment | null;
  canWrite: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirmPaid: (p: MattiiPayment) => void;
}) {
  const { orders, customerOf, staffOf } = useMattiiData();

  if (!payment) return null;

  const order = orders.find((o) => o.id === payment.order_id);
  const customer = order ? customerOf(order.customer_id) : undefined;
  const receiver = staffOf(payment.received_by_id);
  const amount = signedAmount(payment);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{payment.payment_no}</span>
              <PaymentTypeBadge type={payment.payment_type} />
              <PaymentStatusBadge status={payment.status} />
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="ออเดอร์">
              <span className="font-mono">{order?.order_no ?? "—"}</span>
            </Field>
            <Field label="ลูกค้า">{customer?.display_name ?? "—"}</Field>
            <Field label="จำนวนเงิน">
              <span className={amount < 0 ? "tabular-nums text-red-600" : "tabular-nums"}>
                {fmtMoney(amount)}
              </span>
            </Field>
            <Field label="วิธีชำระ">{PAYMENT_METHOD_LABEL[payment.method]}</Field>
            <Field label="วันที่ชำระ">
              <span className="tabular-nums">{fmtDateTH(payment.paid_at)}</span>
            </Field>
            <Field label="ผู้รับเงิน">{receiver?.display_name ?? "—"}</Field>
            <Field label="หลักฐานการโอน">
              {payment.slip_url ? (
                <span className="truncate">{payment.slip_url.split("/").pop()}</span>
              ) : (
                "ไม่มีสลิป (เช่น เก็บเงินปลายทาง)"
              )}
            </Field>
            <Field label="โน้ต" className="sm:col-span-2">
              {payment.note ?? "—"}
            </Field>
          </div>

          {order && order.outstanding_amount > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <StatusBadge tone="warning">
                ค้างชำระ {fmtMoney(order.outstanding_amount)}
              </StatusBadge>
              <Text className="text-xs text-amber-700">
                เป็นข้อมูลเตือนเท่านั้น — ไม่บล็อกการเดินงานของออเดอร์
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {canWrite && payment.status === "pending" && (
            <Button onClick={() => onConfirmPaid(payment)}>ยืนยันว่าได้รับเงินแล้ว</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
