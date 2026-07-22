"use client";

// orders-table.tsx — มุมมองตารางของหน้าออเดอร์
// §2.3 ข้อ 2: คอลัมน์ 🔒 (ต้นทุนรวม / กำไรขั้นต้น / %กำไร) อยู่ท้ายสุดติดกัน → role อื่นตัดทั้งชุด
//              และ footer รวมยอดคิดเฉพาะคอลัมน์ที่แสดงจริง
// §5 ข้อ 3: ห้ามคอลัมน์ปุ่ม action ในแถว → คลิกแถวเปิด detail dialog

import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { EMPTY_STATES } from "../_fixtures/empty-states";
import type { MattiiOrder } from "../_fixtures/types";
import {
  ChannelBadge,
  OrderStatusBadge,
  PriorityBadge,
  fmtDateTH,
  fmtMoney,
  fmtPercent,
  useMattiiData,
  useMattiiRole,
} from "../_components";

export function OrdersTable({
  orders,
  onSelect,
  onClearFilters,
  onCreate,
  filtered,
  canCreate,
}: {
  orders: MattiiOrder[];
  onSelect: (o: MattiiOrder) => void;
  onClearFilters: () => void;
  onCreate: () => void;
  /** true = ผลลัพธ์ว่างเพราะตัวกรอง (ไม่ใช่ไม่มีข้อมูลเลย) */
  filtered: boolean;
  canCreate: boolean;
}) {
  const { isOwner } = useMattiiRole();
  const { customerOf } = useMattiiData();

  const colCount = isOwner ? 10 : 7;
  const totalAmount = orders.reduce((s, o) => s + o.total_amount, 0);
  const totalCost = orders.reduce((s, o) => s + o.total_cost, 0);
  const totalProfit = totalAmount - totalCost;

  return (
    <Table className="shadow-sm" stickyHeader maxHeight="65vh">
      <TableHeader sticky>
        <TableRow>
          <TableHead>เลขที่ออเดอร์</TableHead>
          <TableHead>ลูกค้า</TableHead>
          <TableHead>ช่องทาง</TableHead>
          <TableHead>สถานะ</TableHead>
          <TableHead align="center">กำหนดส่ง</TableHead>
          <TableHead align="right">ยอดเงิน</TableHead>
          <TableHead align="right">คงค้าง</TableHead>
          {isOwner && (
            <>
              <TableHead align="right">ต้นทุนรวม</TableHead>
              <TableHead align="right">กำไรขั้นต้น</TableHead>
              <TableHead align="right">%กำไร</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.length === 0 ? (
          <TableEmpty colSpan={colCount}>
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="rounded-full bg-gray-100 p-4">
                <ShoppingBag className="h-7 w-7 text-gray-400" />
              </div>
              <div className="text-sm font-medium text-gray-900">
                {filtered ? EMPTY_STATES.orders.title : "ยังไม่มีออเดอร์"}
              </div>
              <div className="text-sm text-gray-500">
                {filtered ? EMPTY_STATES.orders.description : "เริ่มจากสร้างออเดอร์แรกจากแชทลูกค้า"}
              </div>
              {filtered ? (
                <Button size="sm" variant="outline" className="mt-1" onClick={onClearFilters}>
                  {EMPTY_STATES.orders.ctaLabel}
                </Button>
              ) : (
                canCreate && (
                  <Button size="sm" className="mt-1" onClick={onCreate}>
                    สร้างออเดอร์แรก
                  </Button>
                )
              )}
            </div>
          </TableEmpty>
        ) : (
          orders.map((o) => {
            const customer = customerOf(o.customer_id);
            return (
              <TableRow key={o.id} clickable onClick={() => onSelect(o)}>
                <TableCell>
                  <span className="font-mono font-medium text-gray-900">{o.order_no}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{customer?.display_name ?? "—"}</span>
                    <PriorityBadge priority={o.priority} />
                  </div>
                </TableCell>
                <TableCell>
                  {o.source_channel ? <ChannelBadge channel={o.source_channel} /> : "—"}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                {/* DESIGN §5: คอลัมน์วันที่ = center (ไม่ใช่ right ที่สงวนให้ตัวเลขเงิน) */}
                <TableCell align="center" className="tabular-nums">
                  {fmtDateTH(o.due_date)}
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
                {isOwner && (
                  <>
                    <TableCell align="right" tabular>
                      {fmtMoney(o.total_cost)}
                    </TableCell>
                    <TableCell
                      align="right"
                      tabular
                      className={o.gross_profit < 0 ? "text-red-600" : "text-green-600"}
                    >
                      {fmtMoney(o.gross_profit)}
                    </TableCell>
                    <TableCell
                      align="right"
                      tabular
                      className={o.margin_percent < 0 ? "text-red-600" : undefined}
                    >
                      {fmtPercent(o.margin_percent)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })
        )}
      </TableBody>
      {orders.length > 0 && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5}>รวม {orders.length} ออเดอร์</TableCell>
            <TableCell align="right" tabular>
              {fmtMoney(totalAmount)}
            </TableCell>
            <TableCell align="right" tabular>
              {fmtMoney(orders.reduce((s, o) => s + o.outstanding_amount, 0))}
            </TableCell>
            {isOwner && (
              <>
                <TableCell align="right" tabular>
                  {fmtMoney(totalCost)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(totalProfit)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtPercent(totalAmount > 0 ? (totalProfit / totalAmount) * 100 : 0)}
                </TableCell>
              </>
            )}
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
