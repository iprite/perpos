"use client";

// customers/customers-table.tsx — ทะเบียนลูกค้า (row click เปิด dialog — ห้ามปุ่ม action ในแถว)
// ไม่มีคอลัมน์ owner-only ในหน้านี้ (ต้นทุน/กำไรอยู่ที่ออเดอร์/รายงานเท่านั้น)

import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
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
import { CUSTOMER_TIER_LABEL } from "../_fixtures/labels";
import type { CustomerTier, MattiiCustomer } from "../_fixtures/types";
import { ChannelBadge, fmtMoney, fmtNum } from "../_components";

const TIER_TONE: Record<CustomerTier, BadgeTone> = {
  new: "neutral",
  regular: "info",
  vip: "success",
};

export function CustomerTierBadge({ tier }: { tier: CustomerTier }) {
  return <StatusBadge tone={TIER_TONE[tier]}>{CUSTOMER_TIER_LABEL[tier]}</StatusBadge>;
}

export function CustomersTable({
  customers,
  loading,
  filtered,
  canWrite,
  onSelect,
  onClearFilters,
  onCreate,
}: {
  customers: MattiiCustomer[];
  loading: boolean;
  filtered: boolean;
  canWrite: boolean;
  onSelect: (c: MattiiCustomer) => void;
  onClearFilters: () => void;
  onCreate: () => void;
}) {
  const totalSpent = customers.reduce((s, c) => s + c.total_spent, 0);
  const totalOrders = customers.reduce((s, c) => s + c.total_orders, 0);

  return (
    <Table className="shadow-sm" stickyHeader maxHeight="65vh">
      <TableHeader sticky>
        <TableRow>
          <TableHead>รหัสลูกค้า</TableHead>
          <TableHead>ชื่อที่แสดง</TableHead>
          <TableHead>ช่องทางหลัก</TableHead>
          <TableHead>ระดับลูกค้า</TableHead>
          <TableHead>เบอร์โทร</TableHead>
          <TableHead>จังหวัด</TableHead>
          <TableHead align="right">ออเดอร์สะสม</TableHead>
          <TableHead align="right">ยอดซื้อสะสม</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableLoading colSpan={8} />
        ) : customers.length === 0 ? (
          <TableEmpty colSpan={8}>
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="rounded-full bg-gray-100 p-4">
                <Users className="h-7 w-7 text-gray-400" />
              </div>
              <div className="text-sm font-medium text-gray-900">
                {filtered ? "ไม่พบลูกค้าตามเงื่อนไขที่เลือก" : "ยังไม่มีลูกค้าในระบบ"}
              </div>
              <div className="text-sm text-gray-500">
                {filtered
                  ? "ลองล้างตัวกรองช่องทาง/ระดับลูกค้า หรือเปลี่ยนคำค้นหา"
                  : "เพิ่มลูกค้ารายแรกเพื่อเริ่มบันทึกประวัติการสั่งซื้อ"}
              </div>
              {filtered ? (
                <Button size="sm" variant="outline" className="mt-1" onClick={onClearFilters}>
                  ล้างตัวกรอง
                </Button>
              ) : (
                canWrite && (
                  <Button size="sm" className="mt-1" onClick={onCreate}>
                    เพิ่มลูกค้ารายแรก
                  </Button>
                )
              )}
            </div>
          </TableEmpty>
        ) : (
          customers.map((c) => (
            <TableRow key={c.id} clickable onClick={() => onSelect(c)}>
              <TableCell>
                <span className="font-mono font-medium text-gray-900">{c.code}</span>
              </TableCell>
              <TableCell>{c.display_name}</TableCell>
              <TableCell>
                <ChannelBadge channel={c.primary_channel} />
              </TableCell>
              <TableCell>
                <CustomerTierBadge tier={c.tier} />
              </TableCell>
              <TableCell className="tabular-nums">{c.phone ?? "—"}</TableCell>
              <TableCell>{c.province ?? "—"}</TableCell>
              <TableCell align="right" className="tabular-nums">
                {fmtNum(c.total_orders)}
              </TableCell>
              <TableCell align="right" tabular>
                {fmtMoney(c.total_spent)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
      {!loading && customers.length > 0 && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={6}>รวม {fmtNum(customers.length)} ราย</TableCell>
            <TableCell align="right" className="tabular-nums">
              {fmtNum(totalOrders)}
            </TableCell>
            <TableCell align="right" tabular>
              {fmtMoney(totalSpent)}
            </TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
