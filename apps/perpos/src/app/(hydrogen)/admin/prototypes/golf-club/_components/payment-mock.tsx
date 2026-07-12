"use client";

// payment-mock.tsx — ขั้นชำระเงิน (mock [D2]) — panel reuse ได้ (booking form + รับชำระย้อนหลัง)
// จ่ายเต็ม/มัดจำ (SegmentedControl) + วิธี promptpay/บัตร/เงินสด (SegmentedControl) + QR จำลอง (div Tailwind, ไม่มี hex)
// ยอด tabular · ไม่ตัดเงินจริง — คืน {payment_status, paid_amount, payment_method}
// ปุ่ม "จ่ายทีหลัง" อยู่ใน footer ของ dialog ที่เรียก (payment optional §4.1) — panel นี้แสดง UX ชำระ

import type { ReactNode } from "react";
import { QrCode, CreditCard, Banknote, ScanLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { SegmentedControl } from "@/components/ui/segmented";
import cn from "@core/utils/class-names";
import { formatAmount } from "./money";
import type { GolfPaymentMethod, GolfPaymentStatus } from "../_fixtures/types";

export type PaymentMode = "full" | "deposit";

export interface PaymentMockValue {
  mode: PaymentMode;
  method: GolfPaymentMethod;
  /** ยอดมัดจำ (ใช้เมื่อ mode='deposit') */
  depositAmount: number;
}

export function defaultPaymentValue(total: number, suggestedDeposit?: number | null): PaymentMockValue {
  const dep =
    suggestedDeposit && suggestedDeposit > 0
      ? Math.min(suggestedDeposit, total)
      : Math.min(Math.round(total * 0.3), total);
  return { mode: "full", method: "promptpay", depositAmount: dep };
}

/** ยอดที่จะชำระตอนนี้ ตาม mode */
export function amountToPay(v: PaymentMockValue, total: number): number {
  return v.mode === "full" ? total : Math.min(Math.max(0, v.depositAmount), total);
}

/** สรุปผลชำระ — คืน field ที่ booking ต้องใช้ (สำหรับสร้างจอง: paid ตั้งแต่ 0) */
export function resolvePaymentResult(
  v: PaymentMockValue,
  total: number,
): { payment_status: GolfPaymentStatus; paid_amount: number; payment_method: GolfPaymentMethod } {
  const paid = amountToPay(v, total);
  const status: GolfPaymentStatus = paid >= total ? "paid" : paid > 0 ? "deposit_paid" : "unpaid";
  return { payment_status: status, paid_amount: paid, payment_method: v.method };
}

const METHOD_META: { value: GolfPaymentMethod; label: string; icon: ReactNode }[] = [
  { value: "promptpay", label: "พร้อมเพย์", icon: <QrCode className="h-4 w-4" /> },
  { value: "card", label: "บัตร", icon: <CreditCard className="h-4 w-4" /> },
  { value: "cash", label: "เงินสด", icon: <Banknote className="h-4 w-4" /> },
];

/** QR PromptPay จำลอง (div Tailwind — ไม่มี hex, ไม่ scan ได้จริง) */
function FakeQr() {
  // pattern 8×8 คงที่ (deterministic) — โมดูลดำ = bg-gray-800
  const cells = Array.from({ length: 64 }, (_, i) => {
    const r = Math.floor(i / 8);
    const c = i % 8;
    const corner = (r < 3 && c < 3) || (r < 3 && c > 4) || (r > 4 && c < 3);
    const on = corner || (r * 7 + c * 3) % 2 === 0;
    return on;
  });
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-8 gap-0.5" aria-hidden="true">
          {cells.map((on, i) => (
            <span
              key={i}
              className={cn("h-4 w-4 rounded-[2px]", on ? "bg-gray-800" : "bg-gray-100")}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <ScanLine className="h-3.5 w-3.5" />
        สแกนจ่ายด้วยแอปธนาคาร (จำลอง — ไม่ตัดเงินจริง)
      </div>
    </div>
  );
}

/** panel ขั้นชำระเงิน — controlled ผ่าน value/onChange */
export function PaymentMock({
  total,
  value,
  onChange,
  allowDeposit = true,
  className,
}: {
  total: number;
  value: PaymentMockValue;
  onChange: (v: PaymentMockValue) => void;
  /** อนุญาตเลือกจ่ายมัดจำ (booking creation) — false = จ่ายเต็มอย่างเดียว */
  allowDeposit?: boolean;
  className?: string;
}) {
  const pay = amountToPay(value, total);

  return (
    <div className={cn("space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4", className)}>
      <div className="flex items-center justify-between">
        <Text className="text-sm font-semibold text-gray-900">ชำระเงิน</Text>
        <span className="text-xs text-gray-500">
          ยอดรวม{" "}
          <span className="font-mono font-semibold tabular-nums text-gray-900">
            {formatAmount(total)}
          </span>
        </span>
      </div>

      {allowDeposit && (
        <div>
          <Label>รูปแบบการชำระ</Label>
          <SegmentedControl
            className="mt-1"
            fullWidth
            value={value.mode}
            onChange={(mode) => onChange({ ...value, mode })}
            options={[
              { value: "full", label: "จ่ายเต็ม" },
              { value: "deposit", label: "จ่ายมัดจำ" },
            ]}
          />
        </div>
      )}

      {allowDeposit && value.mode === "deposit" && (
        <div>
          <Label htmlFor="pm-deposit">ยอดมัดจำ (฿)</Label>
          <Input
            id="pm-deposit"
            type="number"
            className="mt-1"
            value={value.depositAmount || ""}
            onChange={(e) =>
              onChange({ ...value, depositAmount: Math.max(0, Number(e.target.value) || 0) })
            }
          />
          <Text className="mt-1 text-xs text-gray-400">
            คงเหลือชำระที่เคาน์เตอร์วันเล่น{" "}
            <span className="font-mono tabular-nums">{formatAmount(Math.max(0, total - pay))}</span>
          </Text>
        </div>
      )}

      <div>
        <Label>วิธีชำระ</Label>
        <SegmentedControl
          className="mt-1"
          fullWidth
          value={value.method}
          onChange={(method) => onChange({ ...value, method })}
          options={METHOD_META.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))}
        />
      </div>

      {value.method === "promptpay" ? (
        <FakeQr />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 text-center text-xs text-gray-500">
          {value.method === "card"
            ? "รูดบัตร/แตะบัตรที่เครื่อง EDC (จำลอง — ไม่ตัดเงินจริง)"
            : "รับเงินสดที่เคาน์เตอร์ (จำลอง)"}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-gray-200 pt-3">
        <span className="text-sm text-gray-600">ยอดชำระตอนนี้</span>
        <span className="font-mono text-base font-semibold tabular-nums text-primary">
          {formatAmount(pay)}
        </span>
      </div>
    </div>
  );
}
