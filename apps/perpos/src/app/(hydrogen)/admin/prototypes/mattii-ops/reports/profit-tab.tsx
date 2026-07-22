"use client";

// profit-tab.tsx — 🔒 owner-only: ต้นทุน & กำไรรายออเดอร์ (แท็บนี้ไม่ถูก render เลยถ้าไม่ใช่เจ้าของ)
// ยอดขาย/ต้นทุน/กำไรรวม คิดผ่าน salesCostProfitTotals() ใน metrics.ts (แหล่งสูตรเดียว)
// ต้นทุนที่ "กรอกมือ" เพิ่มในหน้านี้เก็บใน client state แล้วบวกทับยอดต้นทุน → กำไรคำนวณสดทันที

import { useMemo, useState } from "react";
import { Coins, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
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
import { Text } from "@/components/ui/typography";
import { ESTIMATED_COST_HINT, orderEconomics, salesCostProfitTotals } from "../_fixtures/metrics";
import type { CostCategory, MattiiOrder, MattiiOrderCost } from "../_fixtures/types";
import {
  SectionHeading,
  fmtMoney,
  fmtNum,
  fmtPercent,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { CostDetailDialog } from "./cost-detail-dialog";

const SORT_OPTIONS = [
  { value: "profit_asc", label: "กำไรน้อย → มาก (ดูตัวที่ขาดทุนก่อน)" },
  { value: "profit_desc", label: "กำไรมาก → น้อย" },
  { value: "sales_desc", label: "ยอดขายมาก → น้อย" },
  { value: "margin_asc", label: "%กำไรน้อย → มาก" },
];

const CATEGORIES: CostCategory[] = ["material", "labor", "machine", "shipping", "other"];

export function ProfitTab({ orders }: { orders: MattiiOrder[] }) {
  const { isOwner } = useMattiiRole();
  const { orderCosts, orderItems, customerOf } = useMattiiData();

  const [extraCosts, setExtraCosts] = useState<MattiiOrderCost[]>([]);
  const [sort, setSort] = useState("profit_asc");
  const [openId, setOpenId] = useState<string | null>(null);

  const allCosts = useMemo(() => [...orderCosts, ...extraCosts], [orderCosts, extraCosts]);

  // ทุกออเดอร์ที่ประเมินต้นทุนได้ (ต้นทุนจริง หรือประมาณการจากรายการพรม) — ยกเลิก/ไม่มีรายการ = ตัดออก
  // สูตรต้นทุน/กำไรมาจาก orderEconomics() ใน metrics.ts แหล่งเดียว (ห้ามคิดเองในหน้า)
  const rows = useMemo(() => {
    const built = orders
      .map((o) => ({ o, econ: orderEconomics(o, orderItems) }))
      .filter((x) => x.econ.basis !== "none")
      .map(({ o, econ }) => {
        const mine = allCosts.filter((c) => c.order_id === o.id);
        const extra = extraCosts
          .filter((c) => c.order_id === o.id)
          .reduce((s, c) => s + c.amount, 0);
        const byCat = Object.fromEntries(
          CATEGORIES.map((cat) => [
            cat,
            mine.filter((c) => c.cost_category === cat).reduce((s, c) => s + c.amount, 0),
          ]),
        ) as Record<CostCategory, number>;
        // ออเดอร์ที่ยังไม่มีต้นทุนจริง → ค่าวัสดุ = ต้นทุนประมาณการ (หมวดอื่นยังเป็น 0)
        if (econ.basis === "estimated") byCat.material = econ.totalCost;
        const totalCost = econ.totalCost + extra;
        const profit = o.total_amount - totalCost;
        return {
          order: o,
          estimated: econ.basis === "estimated",
          byCat,
          totalCost,
          profit,
          margin: o.total_amount > 0 ? (profit / o.total_amount) * 100 : 0,
        };
      });

    return built.sort((a, b) => {
      if (sort === "profit_desc") return b.profit - a.profit;
      if (sort === "sales_desc") return b.order.total_amount - a.order.total_amount;
      if (sort === "margin_asc") return a.margin - b.margin;
      return a.profit - b.profit;
    });
  }, [orders, orderItems, allCosts, extraCosts, sort]);

  const totals = useMemo(() => {
    const base = salesCostProfitTotals(orders, orderItems);
    const extra = extraCosts.reduce((s, c) => s + c.amount, 0);
    const totalCost = base.totalCost + extra;
    const grossProfit = base.totalSales - totalCost;
    return {
      totalSales: base.totalSales,
      totalCost,
      grossProfit,
      marginPercent: base.totalSales > 0 ? (grossProfit / base.totalSales) * 100 : 0,
      countedOrders: base.countedOrders,
      estimatedOrders: base.estimatedOrders,
      lossCount: rows.filter((r) => r.profit < 0).length,
    };
  }, [orders, orderItems, extraCosts, rows]);

  const opened = openId ? (rows.find((r) => r.order.id === openId) ?? null) : null;

  // กันพลาด: แท็บนี้ถูก render เฉพาะเจ้าของอยู่แล้ว — เช็คซ้ำอีกชั้นตาม §2.3
  if (!isOwner) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="ยอดขาย"
          value={fmtMoney(totals.totalSales)}
          sub={`${fmtNum(totals.countedOrders)} ออเดอร์ในช่วงที่เลือก (ไม่รวมที่ยกเลิก)`}
          tone="info"
        />
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="ต้นทุนรวม"
          value={fmtMoney(totals.totalCost)}
          sub={
            totals.estimatedOrders > 0
              ? `ต้นทุนจริง + ประมาณการอีก ${fmtNum(totals.estimatedOrders)} ใบที่ยังไม่เริ่มผลิต`
              : "วัสดุ + ค่าแรง + ค่าเครื่อง + ค่าส่ง"
          }
          tone="neutral"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="กำไรขั้นต้น"
          value={fmtMoney(totals.grossProfit)}
          sub={`อัตรากำไร ${fmtPercent(totals.marginPercent)}`}
          tone={totals.grossProfit >= 0 ? "positive" : "negative"}
          valueColored
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="ออเดอร์ที่ขาดทุน"
          value={fmtNum(totals.lossCount)}
          sub="ส่วนใหญ่มาจากการพิมพ์ซ้ำ — เปิดดูรายละเอียดได้"
          tone={totals.lossCount > 0 ? "negative" : "positive"}
          valueColored
        />
      </div>

      <div>
        <SectionHeading
          actions={
            <CustomSelect value={sort} onChange={setSort} options={SORT_OPTIONS} className="w-72" />
          }
        >
          กำไรรายออเดอร์
        </SectionHeading>
        <Table className="shadow-sm" stickyHeader maxHeight="60vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>เลขที่ออเดอร์</TableHead>
              <TableHead>ลูกค้า</TableHead>
              <TableHead align="right">ยอดขาย</TableHead>
              <TableHead align="right">ค่าวัสดุ</TableHead>
              <TableHead align="right">ค่าแรง</TableHead>
              <TableHead align="right">ค่าเครื่อง</TableHead>
              <TableHead align="right">ค่าขนส่ง</TableHead>
              <TableHead align="right">ต้นทุนรวม</TableHead>
              <TableHead align="right">กำไรขั้นต้น</TableHead>
              <TableHead align="right">%กำไร</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={10}>
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="rounded-full bg-gray-100 p-4">
                    <Coins className="h-7 w-7 text-gray-400" />
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    ยังไม่มีออเดอร์ที่ประเมินต้นทุนได้ในช่วงนี้
                  </div>
                  <div className="text-sm text-gray-500">
                    ออเดอร์ต้องมีรายการพรมอย่างน้อย 1 รายการ จึงจะประมาณการต้นทุนได้
                    (ต้นทุนจริงบันทึกอัตโนมัติเมื่อเข้าสู่สายผลิต)
                  </div>
                </div>
              </TableEmpty>
            ) : (
              rows.map((r) => (
                <TableRow key={r.order.id} clickable onClick={() => setOpenId(r.order.id)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-gray-900">
                        {r.order.order_no}
                      </span>
                      {r.estimated && <StatusBadge tone="neutral">ประมาณการ</StatusBadge>}
                      {r.profit < 0 && <StatusBadge tone="danger">ขาดทุน</StatusBadge>}
                    </div>
                  </TableCell>
                  <TableCell>{customerOf(r.order.customer_id)?.display_name ?? "—"}</TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(r.order.total_amount)}
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={r.estimated ? "text-gray-500" : undefined}
                    title={r.estimated ? ESTIMATED_COST_HINT : undefined}
                  >
                    {`${r.estimated ? "≈ " : ""}${fmtMoney(r.byCat.material)}`}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(r.byCat.labor)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(r.byCat.machine)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(r.byCat.shipping)}
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={r.estimated ? "text-gray-500" : undefined}
                  >
                    {`${r.estimated ? "≈ " : ""}${fmtMoney(r.totalCost)}`}
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={
                      r.profit < 0
                        ? "font-semibold text-red-600"
                        : r.estimated
                          ? "text-gray-500"
                          : "text-green-600"
                    }
                  >
                    {`${r.estimated ? "≈ " : ""}${fmtMoney(r.profit)}`}
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={
                      r.margin < 0 ? "text-red-600" : r.estimated ? "text-gray-500" : undefined
                    }
                  >
                    {`${r.estimated ? "≈ " : ""}${fmtPercent(r.margin)}`}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={7}>
                  รวม {fmtNum(rows.length)} ออเดอร์ (ไม่รวมที่ยกเลิก)
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(rows.reduce((s, r) => s + r.totalCost, 0))}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(rows.reduce((s, r) => s + r.profit, 0))}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtPercent(totals.marginPercent)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
        <Text className="mt-2 px-1 text-xs text-gray-500">≈ = {ESTIMATED_COST_HINT}</Text>
        <Text className="mt-1 px-1 text-xs text-gray-400">
          คลิกที่แถวเพื่อดูต้นทุนแยกหมวดของออเดอร์นั้น และเพิ่มต้นทุนที่กรอกมือ (เช่น ค่าแรง OT)
        </Text>
      </div>

      <CostDetailDialog
        order={opened?.order ?? null}
        costs={opened ? allCosts.filter((c) => c.order_id === opened.order.id) : []}
        totalCost={opened?.totalCost ?? 0}
        estimated={opened?.estimated ?? false}
        onOpenChange={(v) => !v && setOpenId(null)}
        onAddCost={(cost) => setExtraCosts((prev) => [...prev, cost])}
      />
    </div>
  );
}
