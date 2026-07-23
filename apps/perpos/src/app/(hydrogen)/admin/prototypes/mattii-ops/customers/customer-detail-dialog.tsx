"use client";

// customers/customer-detail-dialog.tsx — ประวัติลูกค้า 1 ราย (ข้อมูลติดต่อ + ช่องทาง + ประวัติออเดอร์)
// ปุ่มแก้ไขอยู่ใน DialogFooter (DESIGN §5 ข้อ 3 — ไม่มีปุ่ม action ในแถวตาราง)

import Link from "next/link";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CHAT_CHANNEL_LABEL } from "../_fixtures/labels";
import type { ChatChannel, MattiiCustomer } from "../_fixtures/types";
import {
  ChannelBadge,
  Field,
  MATTII_BASE,
  OrderStatusBadge,
  SectionHeading,
  fmtDateTH,
  fmtMoney,
  fmtNum,
  useMattiiData,
} from "../_components";
import { CustomerTierBadge } from "./customers-table";

export function CustomerDetailDialog({
  customer,
  canWrite,
  onOpenChange,
  onEdit,
}: {
  customer: MattiiCustomer | null;
  canWrite: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (c: MattiiCustomer) => void;
}) {
  const { orders, conversations } = useMattiiData();

  if (!customer) return null;

  const myOrders = orders
    .filter((o) => o.customer_id === customer.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const liveSpent = myOrders.reduce((s, o) => s + o.paid_amount, 0);
  const liveOutstanding = myOrders.reduce((s, o) => s + o.outstanding_amount, 0);
  const myChats = conversations.filter((c) => c.customer_id === customer.id);
  const handles = Object.entries(customer.channel_handles) as [ChatChannel, string][];
  const address = [
    customer.address_line,
    customer.subdistrict,
    customer.district,
    customer.province,
    customer.postcode,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              {customer.display_name}
              <CustomerTierBadge tier={customer.tier} />
              <ChannelBadge channel={customer.primary_channel} />
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="รหัสลูกค้า">
                <span className="font-mono">{customer.code}</span>
              </Field>
              <Field label="ชื่อ-นามสกุล (จัดส่ง)">{customer.full_name ?? "—"}</Field>
              <Field label="เบอร์โทร">
                <span className="tabular-nums">{customer.phone ?? "—"}</span>
              </Field>
              <Field label="ที่อยู่จัดส่ง" className="sm:col-span-3">
                {address || "ยังไม่ได้บันทึกที่อยู่"}
              </Field>
              <Field label="ออเดอร์สะสม">
                <span className="tabular-nums">{fmtNum(myOrders.length)} ใบ</span>
              </Field>
              <Field label="ยอดที่ชำระแล้วรวม">
                <span className="tabular-nums">{fmtMoney(liveSpent)}</span>
              </Field>
              <Field label="ยอดค้างชำระรวม">
                <span
                  className={
                    liveOutstanding > 0 ? "tabular-nums text-red-600" : "tabular-nums text-gray-900"
                  }
                >
                  {fmtMoney(liveOutstanding)}
                </span>
              </Field>
              <Field label="โน้ต" className="sm:col-span-3">
                {customer.note ?? "—"}
              </Field>
            </div>

            <div>
              <SectionHeading>ช่องทางที่ติดต่อ</SectionHeading>
              <div className="flex flex-wrap gap-2 px-1">
                {handles.length === 0 ? (
                  <Text className="text-sm text-gray-500">
                    ยังไม่ได้บันทึกบัญชีช่องทางของลูกค้า
                  </Text>
                ) : (
                  handles.map(([ch, handle]) => (
                    <span
                      key={ch}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700"
                    >
                      <span className="font-medium">{CHAT_CHANNEL_LABEL[ch]}</span>
                      <span className="text-gray-500">{handle}</span>
                    </span>
                  ))
                )}
                {myChats.length > 0 && (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`${MATTII_BASE}/inbox`}>
                      เปิดกล่องแชท ({fmtNum(myChats.length)} ห้อง)
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            <div>
              <SectionHeading>ประวัติการสั่ง</SectionHeading>
              <Table className="shadow-sm" maxHeight="40vh">
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่ออเดอร์</TableHead>
                    <TableHead>วันที่</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead align="right">ยอดเงิน</TableHead>
                    <TableHead align="right">คงค้าง</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myOrders.length === 0 ? (
                    <TableEmpty colSpan={5}>ลูกค้ารายนี้ยังไม่มีออเดอร์</TableEmpty>
                  ) : (
                    myOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>
                          <span className="font-mono">{o.order_no}</span>
                        </TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {fmtDateTH(o.created_at)}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={o.status} />
                        </TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(o.total_amount)}
                        </TableCell>
                        <TableCell
                          align="right"
                          tabular
                          className={o.outstanding_amount > 0 ? "text-red-600" : undefined}
                        >
                          {fmtMoney(o.outstanding_amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {canWrite && <Button onClick={() => onEdit(customer)}>แก้ไขข้อมูลลูกค้า</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
