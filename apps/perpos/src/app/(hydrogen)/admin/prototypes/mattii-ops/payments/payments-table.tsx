"use client";

// payments/payments-table.tsx — รายการรับชำระ/คืนเงิน (row click เปิด dialog — ไม่มีปุ่มในแถว)
// คืนเงินแสดงเป็นยอดลบด้วย U+2212 ผ่าน fmtMoney (DESIGN §2)

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
} from "@/components/ui/table";
import { PAYMENT_METHOD_LABEL } from "../_fixtures/labels";
import type { MattiiOrder, MattiiPayment } from "../_fixtures/types";
import { PaymentStatusBadge, PaymentTypeBadge, fmtDateTH, fmtMoney, fmtNum } from "../_components";
import { signedAmount } from "./summary";

export function PaymentsTable({
  payments,
  orders,
  loading,
  filtered,
  canWrite,
  onSelect,
  onClearFilters,
  onCreate,
}: {
  payments: MattiiPayment[];
  orders: MattiiOrder[];
  loading: boolean;
  filtered: boolean;
  canWrite: boolean;
  onSelect: (p: MattiiPayment) => void;
  onClearFilters: () => void;
  onCreate: () => void;
}) {
  const net = payments.filter((p) => p.status === "paid").reduce((s, p) => s + signedAmount(p), 0);

  return (
    <Table className="shadow-sm" stickyHeader maxHeight="60vh">
      <TableHeader sticky>
        <TableRow>
          <TableHead>เลขที่รายการ</TableHead>
          <TableHead>ออเดอร์</TableHead>
          <TableHead>ประเภท</TableHead>
          <TableHead>วิธีชำระ</TableHead>
          <TableHead>สถานะ</TableHead>
          <TableHead align="right">วันที่ชำระ</TableHead>
          <TableHead align="right">จำนวนเงิน</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableLoading colSpan={7} />
        ) : payments.length === 0 ? (
          <TableEmpty colSpan={7}>
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="rounded-full bg-gray-100 p-4">
                <Wallet className="h-7 w-7 text-gray-400" />
              </div>
              <div className="text-sm font-medium text-gray-900">
                {filtered ? "ไม่พบรายการชำระตามเงื่อนไขที่เลือก" : "ยังไม่มีรายการรับชำระ"}
              </div>
              <div className="text-sm text-gray-500">
                {filtered
                  ? "ลองล้างตัวกรองประเภท/วิธีชำระ/สถานะ"
                  : "บันทึกรับชำระรายการแรกเมื่อได้รับเงินจากลูกค้า"}
              </div>
              {filtered ? (
                <Button size="sm" variant="outline" className="mt-1" onClick={onClearFilters}>
                  ล้างตัวกรอง
                </Button>
              ) : (
                canWrite && (
                  <Button size="sm" className="mt-1" onClick={onCreate}>
                    บันทึกรับชำระรายการแรก
                  </Button>
                )
              )}
            </div>
          </TableEmpty>
        ) : (
          payments.map((p) => {
            const order = orders.find((o) => o.id === p.order_id);
            const amount = signedAmount(p);
            return (
              <TableRow key={p.id} clickable onClick={() => onSelect(p)}>
                <TableCell>
                  <span className="font-mono font-medium text-gray-900">{p.payment_no}</span>
                </TableCell>
                <TableCell>
                  <span className="font-mono">{order?.order_no ?? "—"}</span>
                </TableCell>
                <TableCell>
                  <PaymentTypeBadge type={p.payment_type} />
                </TableCell>
                <TableCell>{PAYMENT_METHOD_LABEL[p.method]}</TableCell>
                <TableCell>
                  <PaymentStatusBadge status={p.status} />
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {fmtDateTH(p.paid_at)}
                </TableCell>
                <TableCell
                  align="right"
                  tabular
                  className={amount < 0 ? "text-red-600" : "text-gray-900"}
                >
                  {fmtMoney(amount)}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
      {!loading && payments.length > 0 && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={6}>
              รวม {fmtNum(payments.length)} รายการ (เฉพาะที่ชำระแล้ว)
            </TableCell>
            <TableCell align="right" tabular className={net < 0 ? "text-red-600" : undefined}>
              {fmtMoney(net)}
            </TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
