"use client";

import { useMemo } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import type { StockItem, StockLocation, StockBalance } from "./_types";

/** ตารางของใช้ซ้ำ: รายการ × จุดเก็บ — ตอบว่า "ผ้าอยู่ที่ไหนบ้าง" ไม่ใช่แค่ "มีกี่ผืน"
 *  (specs/tmc-stock-v2.md §5 แท็บ "ของใช้ซ้ำ")
 */
export function ReusableMatrix({
  items,
  locations,
  balances,
  onPickItem,
}: {
  items: StockItem[];
  locations: StockLocation[];
  balances: StockBalance[];
  onPickItem: (item: StockItem) => void;
}) {
  // key = `${itemId}|${locationId}`
  const qtyMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of balances) m.set(`${b.item_id}|${b.location_id}`, Number(b.qty));
    return m;
  }, [balances]);

  // โชว์เฉพาะจุดเก็บที่เกี่ยวกับของใช้ซ้ำจริง ๆ — ไม่งั้นตารางกว้างโดยเปล่าประโยชน์
  const cols = useMemo(() => {
    const used = new Set(balances.filter((b) => Number(b.qty) !== 0).map((b) => b.location_id));
    return locations.filter(
      (l) => used.has(l.id) || ["linen_room", "soiled", "laundry", "warehouse"].includes(l.kind),
    );
  }, [locations, balances]);

  const rows = useMemo(
    () =>
      items.map((it) => {
        const cells = cols.map((l) => qtyMap.get(`${it.id}|${l.id}`) ?? 0);
        return { item: it, cells, total: cells.reduce((s, n) => s + n, 0) };
      }),
    [items, cols, qtyMap],
  );

  const pager = usePagination(rows, { pageSize: 20, resetKey: String(cols.length) });

  return (
    <div className="space-y-3">
      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>รายการ</TableHead>
            {cols.map((l) => (
              <TableHead key={l.id} align="right">
                {l.name}
              </TableHead>
            ))}
            <TableHead align="right">รวม</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pager.rows.map((r) => (
            <TableRow key={r.item.id} clickable onClick={() => onPickItem(r.item)}>
              <TableCell className="font-medium text-gray-900">{r.item.name}</TableCell>
              {r.cells.map((n, i) => (
                <TableCell
                  key={cols[i].id}
                  align="right"
                  className={n === 0 ? "tabular-nums text-gray-300" : "tabular-nums text-gray-700"}
                >
                  {n === 0 ? "—" : n}
                </TableCell>
              ))}
              <TableCell align="right" className="font-semibold tabular-nums text-gray-900">
                {r.total} {r.item.unit}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableEmpty colSpan={cols.length + 2}>ไม่พบของใช้ซ้ำตามเงื่อนไข</TableEmpty>
          )}
        </TableBody>
      </Table>
      <TablePager pager={pager} unit="รายการ" />
    </div>
  );
}
