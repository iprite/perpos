"use client";

// orders-table.tsx — มุมมองตารางของหน้าออเดอร์
// §2.3 ข้อ 2: คอลัมน์ 🔒 (ต้นทุนรวม / กำไรขั้นต้น / %กำไร) อยู่ท้ายสุดติดกัน → role อื่นตัดทั้งชุด
//              และ footer รวมยอดคิดเฉพาะคอลัมน์ที่แสดงจริง
// §5 ข้อ 3: ห้ามคอลัมน์ปุ่ม action ในแถว → คลิกแถวเปิด detail dialog
// ต้นทุน/กำไรทุกช่องคิดผ่าน orderEconomics()/salesCostProfitTotals() ใน metrics.ts แหล่งเดียว
// แถวที่ยังไม่มีต้นทุนจริง = ต้นทุน "ประมาณการ" → นำหน้าด้วย ≈ + ตัวเลขสีเทา + คำอธิบายใต้ตาราง
// (เลือก ≈ แทน badge ในทุกแถว เพราะกว่าครึ่งตารางเป็นประมาณการ — badge จะกลายเป็น noise)

import { useMemo } from "react";
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
import { Text } from "@/components/ui/typography";
import { EMPTY_STATES } from "../_fixtures/empty-states";
import { ESTIMATED_COST_HINT, orderEconomics, salesCostProfitTotals } from "../_fixtures/metrics";
import type { MattiiOrder } from "../_fixtures/types";
import {
  ChannelBadge,
  OrderStatusBadge,
  PriorityBadge,
  fmtDateTH,
  fmtMoney,
  fmtNum,
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
  const { customerOf, orderItems } = useMattiiData();

  const colCount = isOwner ? 10 : 7;
  const totalAmount = orders.reduce((s, o) => s + o.total_amount, 0);

  // ต้นทุน/กำไรรายแถว + ยอดรวม — คิดจาก metrics.ts แหล่งเดียว (ประมาณการเมื่อยังไม่มีต้นทุนจริง)
  const econOf = useMemo(() => {
    const map = new Map<string, ReturnType<typeof orderEconomics>>();
    for (const o of orders) map.set(o.id, orderEconomics(o, orderItems));
    return map;
  }, [orders, orderItems]);
  const totals = useMemo(() => salesCostProfitTotals(orders, orderItems), [orders, orderItems]);
  const hasEstimated = totals.estimatedOrders > 0;

  return (
    <>
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
                  {filtered
                    ? EMPTY_STATES.orders.description
                    : "เริ่มจากสร้างออเดอร์แรกจากแชทลูกค้า"}
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
              const econ = econOf.get(o.id);
              const estimated = econ?.basis === "estimated";
              const unknown = !econ || econ.basis === "none";
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
                      <TableCell
                        align="right"
                        tabular
                        className={estimated ? "text-gray-500" : undefined}
                        title={estimated ? ESTIMATED_COST_HINT : undefined}
                      >
                        {unknown
                          ? "—"
                          : `${estimated ? "≈ " : ""}${fmtMoney(econ?.totalCost ?? 0)}`}
                      </TableCell>
                      <TableCell
                        align="right"
                        tabular
                        className={
                          unknown
                            ? "text-gray-400"
                            : (econ?.grossProfit ?? 0) < 0
                              ? "text-red-600"
                              : estimated
                                ? "text-gray-500"
                                : "text-green-600"
                        }
                      >
                        {unknown
                          ? "—"
                          : `${estimated ? "≈ " : ""}${fmtMoney(econ?.grossProfit ?? 0)}`}
                      </TableCell>
                      <TableCell
                        align="right"
                        tabular
                        className={
                          unknown
                            ? "text-gray-400"
                            : (econ?.marginPercent ?? 0) < 0
                              ? "text-red-600"
                              : estimated
                                ? "text-gray-500"
                                : undefined
                        }
                      >
                        {unknown
                          ? "—"
                          : `${estimated ? "≈ " : ""}${fmtPercent(econ?.marginPercent ?? 0)}`}
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
                    {fmtMoney(totals.totalCost)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(totals.grossProfit)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtPercent(totals.marginPercent)}
                  </TableCell>
                </>
              )}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {isOwner && orders.length > 0 && (
        <Text className="mt-2 px-1 text-xs text-gray-500">
          {hasEstimated
            ? `≈ = ${ESTIMATED_COST_HINT} · ${fmtNum(totals.estimatedOrders)} จาก ${fmtNum(totals.countedOrders)} ใบยังใช้ตัวเลขประมาณการ · ยอดรวมท้ายตารางไม่นับออเดอร์ที่ยกเลิก`
            : "ยอดรวมท้ายตารางไม่นับออเดอร์ที่ยกเลิก"}
        </Text>
      )}
    </>
  );
}
