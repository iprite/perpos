"use client";

// sales-tab.tsx — ยอดขายตามช่องทาง + แบบพรมที่ขายดี
// ยอด/ต้นทุน/กำไรของแต่ละกลุ่ม คิดผ่าน salesCostProfitTotals() ใน metrics.ts (แหล่งสูตรเดียว)
// 🔒 owner-only §2.3: คอลัมน์ต้นทุน/กำไร อยู่ท้ายสุดติดกัน

import { useMemo } from "react";
import { Wallet } from "lucide-react";
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
import { CHAT_CHANNEL_LABEL } from "../_fixtures/labels";
import { salesCostProfitTotals } from "../_fixtures/metrics";
import type { ChatChannel, MattiiOrder } from "../_fixtures/types";
import {
  SectionHeading,
  fmtMoney,
  fmtNum,
  fmtPercent,
  useMattiiData,
  useMattiiRole,
} from "../_components";

const CHANNELS: (ChatChannel | "other")[] = ["facebook", "line", "tiktok", "other"];

export function SalesTab({ orders }: { orders: MattiiOrder[] }) {
  const { isOwner } = useMattiiRole();
  const { orderItems } = useMattiiData();

  const byChannel = useMemo(
    () =>
      CHANNELS.map((ch) => {
        const subset = orders.filter((o) =>
          ch === "other" ? !o.source_channel : o.source_channel === ch,
        );
        return {
          key: ch,
          label: ch === "other" ? "อื่น ๆ / หน้าร้าน" : CHAT_CHANNEL_LABEL[ch],
          count: subset.length,
          ...salesCostProfitTotals(subset, orderItems),
        };
      }).filter((row) => row.count > 0),
    [orders, orderItems],
  );

  const total = useMemo(() => salesCostProfitTotals(orders, orderItems), [orders, orderItems]);

  const byProduct = useMemo(() => {
    const ids = new Set(orders.map((o) => o.id));
    const map = new Map<string, { name: string; pieces: number; amount: number }>();
    for (const it of orderItems) {
      if (!ids.has(it.order_id)) continue;
      const key = it.item_name || "ไม่ระบุแบบ";
      const row = map.get(key) ?? { name: key, pieces: 0, amount: 0 };
      row.pieces += it.qty;
      row.amount += it.line_total;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [orders, orderItems]);

  const channelCols = isOwner ? 6 : 4;

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>ยอดขายตามช่องทางที่ลูกค้าทักเข้ามา</SectionHeading>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>ช่องทาง</TableHead>
              <TableHead align="right">จำนวนออเดอร์</TableHead>
              <TableHead align="right">ยอดขาย</TableHead>
              <TableHead align="right">ยอดเฉลี่ย/ออเดอร์</TableHead>
              {isOwner && (
                <>
                  <TableHead align="right">ต้นทุน</TableHead>
                  <TableHead align="right">กำไรขั้นต้น</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {byChannel.length === 0 ? (
              <TableEmpty colSpan={channelCols}>
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="rounded-full bg-gray-100 p-4">
                    <Wallet className="h-7 w-7 text-gray-400" />
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    ไม่มียอดขายในช่วงวันที่เลือก
                  </div>
                  <div className="text-sm text-gray-500">ลองขยายช่วงวันที่ด้านบน</div>
                </div>
              </TableEmpty>
            ) : (
              byChannel.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {fmtNum(row.count)} ใบ
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(row.totalSales)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(row.countedOrders > 0 ? row.totalSales / row.countedOrders : 0)}
                  </TableCell>
                  {isOwner && (
                    <>
                      <TableCell align="right" tabular>
                        {fmtMoney(row.totalCost)}
                      </TableCell>
                      <TableCell
                        align="right"
                        tabular
                        className={row.grossProfit < 0 ? "text-red-600" : "text-green-600"}
                      >
                        {fmtMoney(row.grossProfit)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
          {byChannel.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell>รวมทุกช่องทาง</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {fmtNum(orders.length)} ใบ
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(total.totalSales)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(total.countedOrders > 0 ? total.totalSales / total.countedOrders : 0)}
                </TableCell>
                {isOwner && (
                  <>
                    <TableCell align="right" tabular>
                      {fmtMoney(total.totalCost)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {`${fmtMoney(total.grossProfit)} · ${fmtPercent(total.marginPercent)}`}
                    </TableCell>
                  </>
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
        {isOwner && (
          <Text className="mt-2 px-1 text-xs text-gray-500">
            ต้นทุน/กำไรไม่นับออเดอร์ที่ยกเลิก
            {total.estimatedOrders > 0
              ? ` · ${fmtNum(total.estimatedOrders)} ใบยังใช้ต้นทุนประมาณการจากรายการพรม (ต้นทุนจริงเกิดเมื่อเริ่มผลิต)`
              : ""}
          </Text>
        )}
      </div>

      <div>
        <SectionHeading>แบบพรมที่ขายดีในช่วงนี้</SectionHeading>
        <Table className="shadow-sm" stickyHeader maxHeight="45vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>แบบพรม</TableHead>
              <TableHead align="right">จำนวนผืน</TableHead>
              <TableHead align="right">ยอดขาย</TableHead>
              <TableHead align="right">สัดส่วนยอดขาย</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byProduct.length === 0 ? (
              <TableEmpty colSpan={4}>ไม่มีรายการพรมในช่วงวันที่เลือก</TableEmpty>
            ) : (
              byProduct.map((p) => (
                <TableRow key={p.name}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {fmtNum(p.pieces)} ผืน
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(p.amount)}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {fmtPercent(total.totalSales > 0 ? (p.amount / total.totalSales) * 100 : 0)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
