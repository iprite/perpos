"use client";

// shipments-table.tsx — ตารางพัสดุ (DESIGN §5: row click เปิด dialog · ห้ามปุ่มในแถว)
// 🔒 คอลัมน์ "ค่าส่ง" เป็น owner-only → อยู่ท้ายสุด ตัดทั้งคอลัมน์เมื่อไม่ใช่เจ้าของ (§2.3 ข้อ 2)

import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { SHIPMENT_CARRIER_LABEL } from "../_fixtures/labels";
import { ShipmentStatusBadge, fmtMoney, fmtNum, useMattiiRole } from "../_components";
import type { ShipmentRow } from "./use-shipments-state";

export function ShipmentsTable({
  rows,
  filtered,
  onSelect,
  onClearFilters,
}: {
  rows: ShipmentRow[];
  filtered: boolean;
  onSelect: (row: ShipmentRow) => void;
  onClearFilters: () => void;
}) {
  const { isOwner } = useMattiiRole();
  const colCount = isOwner ? 7 : 6;
  const codTotal = rows.reduce(
    (s, r) => s + (r.shipment.cod_collected ? 0 : r.shipment.cod_amount),
    0,
  );
  const shippingTotal = rows.reduce((s, r) => s + r.shipment.shipping_cost, 0);

  return (
    <Table className="shadow-sm" stickyHeader maxHeight="65vh">
      <TableHeader sticky>
        <TableRow>
          <TableHead>ออเดอร์ / ผู้รับ</TableHead>
          <TableHead>ขนส่ง</TableHead>
          <TableHead>เลขพัสดุ</TableHead>
          <TableHead>สถานะพัสดุ</TableHead>
          <TableHead>ปลายทาง</TableHead>
          <TableHead align="right">เก็บเงินปลายทาง</TableHead>
          {isOwner && <TableHead align="right">ค่าส่ง</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={colCount}>
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="rounded-full bg-gray-100 p-4">
                <Truck className="h-7 w-7 text-gray-400" />
              </div>
              <div className="text-sm font-medium text-gray-900">
                {filtered ? "ไม่พบพัสดุตามเงื่อนไขที่เลือก" : "ยังไม่มีพัสดุที่ต้องส่ง"}
              </div>
              <div className="text-sm text-gray-500">
                {filtered
                  ? "ลองล้างตัวกรองขนส่ง/สถานะ หรือเปลี่ยนคำค้นหา"
                  : "เมื่อทีมผลิตกด “แพ็คเสร็จ” ออเดอร์จะมาโผล่ที่หน้านี้ให้สร้างรายการส่ง"}
              </div>
              {filtered && (
                <Button size="sm" variant="outline" className="mt-1" onClick={onClearFilters}>
                  ล้างตัวกรอง
                </Button>
              )}
            </div>
          </TableEmpty>
        ) : (
          rows.map((r) => (
            <TableRow key={r.key} clickable onClick={() => onSelect(r)}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-gray-500">
                    {r.order?.order_no ?? "—"}
                  </span>
                  <span>{r.shipment.recipient_name || (r.customer?.display_name ?? "—")}</span>
                </div>
              </TableCell>
              <TableCell>{SHIPMENT_CARRIER_LABEL[r.shipment.carrier]}</TableCell>
              <TableCell>
                {r.shipment.tracking_no ? (
                  <span className="font-mono text-xs text-gray-900">{r.shipment.tracking_no}</span>
                ) : (
                  <span className="text-xs text-gray-400">ยังไม่มีเลขพัสดุ</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <ShipmentStatusBadge status={r.shipment.status} />
                  {r.isDraft && <StatusBadge tone="warning">ยังไม่ได้สร้างรายการส่ง</StatusBadge>}
                </div>
              </TableCell>
              <TableCell wrap className="max-w-xs text-xs text-gray-500">
                {r.shipment.address_snapshot || "ยังไม่ได้กรอกที่อยู่"}
              </TableCell>
              <TableCell align="right" tabular>
                {r.shipment.cod_amount > 0 ? (
                  <span className={r.shipment.cod_collected ? "text-green-600" : "text-red-600"}>
                    {fmtMoney(r.shipment.cod_amount)}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>
              {isOwner && (
                <TableCell align="right" tabular>
                  {fmtMoney(r.shipment.shipping_cost)}
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
      {rows.length > 0 && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5}>รวม {fmtNum(rows.length)} พัสดุ</TableCell>
            <TableCell align="right" tabular>
              {fmtMoney(codTotal)}
            </TableCell>
            {isOwner && (
              <TableCell align="right" tabular>
                {fmtMoney(shippingTotal)}
              </TableCell>
            )}
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
