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
import { salesCostProfitTotals } from "../_fixtures/metrics";
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
  const { orderCosts, customerOf } = useMattiiData();

  const [extraCosts, setExtraCosts] = useState<MattiiOrderCost[]>([]);
  const [sort, setSort] = useState("profit_asc");
  const [openId, setOpenId] = useState<string | null>(null);

  const allCosts = useMemo(() => [...orderCosts, ...extraCosts], [orderCosts, extraCosts]);

  const rows = useMemo(() => {
    const built = orders
      .filter((o) => o.total_cost > 0 || allCosts.some((c) => c.order_id === o.id))
      .map((o) => {
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
        const totalCost = o.total_cost + extra;
        const profit = o.total_amount - totalCost;
        return {
          order: o,
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
  }, [orders, allCosts, extraCosts, sort]);

  const totals = useMemo(() => {
    const base = salesCostProfitTotals(orders);
    const extra = extraCosts.reduce((s, c) => s + c.amount, 0);
    const totalCost = base.totalCost + extra;
    const grossProfit = base.totalSales - totalCost;
    return {
      totalSales: base.totalSales,
      totalCost,
      grossProfit,
      marginPercent: base.totalSales > 0 ? (grossProfit / base.totalSales) * 100 : 0,
      lossCount: rows.filter((r) => r.profit < 0).length,
    };
  }, [orders, extraCosts, rows]);

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
          sub={`${fmtNum(orders.length)} ออเดอร์ในช่วงที่เลือก`}
          tone="info"
        />
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="ต้นทุนรวม"
          value={fmtMoney(totals.totalCost)}
          sub="วัสดุ + ค่าแรง + ค่าเครื่อง + ค่าส่ง"
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
                    ยังไม่มีออเดอร์ที่บันทึกต้นทุนในช่วงนี้
                  </div>
                  <div className="text-sm text-gray-500">
                    ต้นทุนจะถูกบันทึกอัตโนมัติเมื่อออเดอร์เข้าสู่สายผลิต (ตัดสต๊อก/ค่าส่ง)
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
                      {r.profit < 0 && <StatusBadge tone="danger">ขาดทุน</StatusBadge>}
                    </div>
                  </TableCell>
                  <TableCell>{customerOf(r.order.customer_id)?.display_name ?? "—"}</TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(r.order.total_amount)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(r.byCat.material)}
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
                  <TableCell align="right" tabular>
                    {fmtMoney(r.totalCost)}
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={r.profit < 0 ? "font-semibold text-red-600" : "text-green-600"}
                  >
                    {fmtMoney(r.profit)}
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={r.margin < 0 ? "text-red-600" : undefined}
                  >
                    {fmtPercent(r.margin)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={7}>รวม {fmtNum(rows.length)} ออเดอร์ที่มีต้นทุน</TableCell>
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
        <Text className="mt-2 px-1 text-xs text-gray-400">
          คลิกที่แถวเพื่อดูต้นทุนแยกหมวดของออเดอร์นั้น และเพิ่มต้นทุนที่กรอกมือ (เช่น ค่าแรง OT)
        </Text>
      </div>

      <CostDetailDialog
        order={opened?.order ?? null}
        costs={opened ? allCosts.filter((c) => c.order_id === opened.order.id) : []}
        totalCost={opened?.totalCost ?? 0}
        onOpenChange={(v) => !v && setOpenId(null)}
        onAddCost={(cost) => setExtraCosts((prev) => [...prev, cost])}
      />
    </div>
  );
}
