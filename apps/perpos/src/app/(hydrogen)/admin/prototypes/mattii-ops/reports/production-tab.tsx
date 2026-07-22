"use client";

// production-tab.tsx — งานผลิต: ของเสีย/พิมพ์ซ้ำ + การใช้วัสดุ
// อัตราพิมพ์ซ้ำมาจาก reprintRatePercent() ใน metrics.ts (แหล่งเดียว)
// 🔒 owner-only §2.3: มูลค่าของเสีย + มูลค่าวัสดุที่ใช้ ซ่อนทั้งคอลัมน์/การ์ด

import { useMemo } from "react";
import { AlertTriangle, Factory, Recycle } from "lucide-react";
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
import {
  MATERIAL_UNIT_LABEL,
  QC_DEFECT_TYPE_LABEL,
  STOCK_MOVE_TYPE_LABEL,
} from "../_fixtures/labels";
import { reprintRatePercent } from "../_fixtures/metrics";
import { benchmark } from "../_fixtures/benchmarks";
import type { MattiiOrder, QcDefectType, StockMoveType } from "../_fixtures/types";
import {
  SectionHeading,
  fmtMoney,
  fmtNum,
  fmtPercent,
  useMattiiData,
  useMattiiRole,
} from "../_components";

const CONSUMING: StockMoveType[] = ["consume_print", "consume_pack", "waste"];

export function ProductionTab({ orders }: { orders: MattiiOrder[] }) {
  const { isOwner } = useMattiiRole();
  const { qcRecords, stockMovements, materials, printJobs } = useMattiiData();

  const scopedIds = useMemo(() => new Set(orders.map((o) => o.id)), [orders]);

  const qc = useMemo(() => {
    const rows = qcRecords.filter((q) => scopedIds.has(q.order_id));
    const fails = rows.filter((q) => q.result === "fail");
    const map = new Map<QcDefectType, { count: number; pieces: number; cost: number }>();
    for (const f of fails) {
      const key = f.defect_type ?? "other";
      const row = map.get(key) ?? { count: 0, pieces: 0, cost: 0 };
      row.count += 1;
      row.pieces += f.defect_qty;
      row.cost += f.defect_cost;
      map.set(key, row);
    }
    return {
      checked: rows.length,
      failCount: fails.length,
      failPieces: fails.reduce((s, f) => s + f.defect_qty, 0),
      defectCost: fails.reduce((s, f) => s + f.defect_cost, 0),
      passRate: rows.length > 0 ? ((rows.length - fails.length) / rows.length) * 100 : 0,
      byType: Array.from(map.entries())
        .map(([type, v]) => ({ type, ...v }))
        .sort((a, b) => b.pieces - a.pieces),
    };
  }, [qcRecords, scopedIds]);

  const usage = useMemo(() => {
    const map = new Map<string, { used: number; wasted: number; value: number }>();
    for (const mv of stockMovements) {
      if (!CONSUMING.includes(mv.move_type)) continue;
      const row = map.get(mv.material_id) ?? { used: 0, wasted: 0, value: 0 };
      row.used += Math.abs(mv.qty_delta);
      if (mv.move_type === "waste") row.wasted += Math.abs(mv.qty_delta);
      row.value += mv.total_cost;
      map.set(mv.material_id, row);
    }
    return Array.from(map.entries())
      .map(([materialId, v]) => ({
        material: materials.find((m) => m.id === materialId),
        ...v,
      }))
      .filter((r) => Boolean(r.material))
      .sort((a, b) => b.value - a.value);
  }, [stockMovements, materials]);

  const reprint = reprintRatePercent(orders, printJobs);
  const wasteValue = useMemo(
    () =>
      stockMovements
        .filter((mv) => mv.move_type === "waste")
        .reduce((s, mv) => s + mv.total_cost, 0),
    [stockMovements],
  );

  const defectCols = isOwner ? 4 : 3;
  const usageCols = isOwner ? 4 : 3;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Factory className="h-4 w-4" />}
          label="ตรวจคุณภาพทั้งหมด"
          value={fmtNum(qc.checked)}
          sub={`ผ่านรอบแรก ${fmtPercent(qc.passRate)}`}
          tone="neutral"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="ผืนที่ต้องพิมพ์ซ้ำ"
          value={`${fmtNum(qc.failPieces)} ผืน`}
          sub={`จาก ${fmtNum(qc.failCount)} ครั้งที่ QC ไม่ผ่าน`}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Recycle className="h-4 w-4" />}
          label="อัตราพิมพ์ซ้ำ"
          value={fmtPercent(reprint)}
          sub={`เดิมก่อนมีระบบ ~${fmtPercent(benchmark.reprint_rate_baseline)}`}
          tone="warning"
          valueColored
        />
        {isOwner && (
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="มูลค่าของเสียสะสม"
            value={fmtMoney(wasteValue)}
            sub="ผ้า/หมึกที่พิมพ์แล้วใช้ไม่ได้"
            tone="negative"
            valueColored
          />
        )}
      </div>

      <div>
        <SectionHeading>ของเสียแยกตามสาเหตุ</SectionHeading>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>สาเหตุที่ไม่ผ่าน</TableHead>
              <TableHead align="right">จำนวนครั้ง</TableHead>
              <TableHead align="right">ผืนที่เสีย</TableHead>
              {isOwner && <TableHead align="right">มูลค่าความเสียหาย</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {qc.byType.length === 0 ? (
              <TableEmpty colSpan={defectCols}>
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="rounded-full bg-gray-100 p-4">
                    <Factory className="h-7 w-7 text-gray-400" />
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    ไม่มีงานที่ QC ไม่ผ่านในช่วงนี้
                  </div>
                  <div className="text-sm text-gray-500">
                    ทุกงานผ่านตั้งแต่รอบแรก — ไม่มีผ้าและเวลาที่เสียไป
                  </div>
                </div>
              </TableEmpty>
            ) : (
              qc.byType.map((row) => (
                <TableRow key={row.type}>
                  <TableCell>
                    <StatusBadge tone="danger">{QC_DEFECT_TYPE_LABEL[row.type]}</StatusBadge>
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {fmtNum(row.count)} ครั้ง
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {fmtNum(row.pieces)} ผืน
                  </TableCell>
                  {isOwner && (
                    <TableCell align="right" tabular className="text-red-600">
                      {fmtMoney(row.cost)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
          {qc.byType.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell>รวม</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {fmtNum(qc.failCount)} ครั้ง
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {fmtNum(qc.failPieces)} ผืน
                </TableCell>
                {isOwner && (
                  <TableCell align="right" tabular className="text-red-600">
                    {fmtMoney(qc.defectCost)}
                  </TableCell>
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      <div>
        <SectionHeading>การใช้วัสดุ (ตัดตอนพิมพ์ + ตอนแพ็ค + ของเสีย)</SectionHeading>
        <Table className="shadow-sm" stickyHeader maxHeight="45vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>วัสดุ</TableHead>
              <TableHead align="right">ใช้ไปทั้งหมด</TableHead>
              <TableHead align="right">ในนั้นเป็นของเสีย</TableHead>
              {isOwner && <TableHead align="right">มูลค่าที่ใช้</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.length === 0 ? (
              <TableEmpty colSpan={usageCols}>ยังไม่มีการตัดสต๊อกในระบบ</TableEmpty>
            ) : (
              usage.map((row) => {
                const unit = row.material ? MATERIAL_UNIT_LABEL[row.material.unit] : "";
                return (
                  <TableRow key={row.material?.id}>
                    <TableCell>{row.material?.name}</TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {fmtNum(row.used, row.used % 1 === 0 ? 0 : 2)} {unit}
                    </TableCell>
                    <TableCell
                      align="right"
                      className={row.wasted > 0 ? "tabular-nums text-red-600" : "tabular-nums"}
                    >
                      {row.wasted > 0
                        ? `${fmtNum(row.wasted, row.wasted % 1 === 0 ? 0 : 3)} ${unit}`
                        : "—"}
                    </TableCell>
                    {isOwner && (
                      <TableCell align="right" tabular>
                        {fmtMoney(row.value)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Text className="mt-2 px-1 text-xs text-gray-400">
          นับจากความเคลื่อนไหวสต๊อกทั้งหมดในระบบ ({STOCK_MOVE_TYPE_LABEL.consume_print} ·{" "}
          {STOCK_MOVE_TYPE_LABEL.consume_pack} · {STOCK_MOVE_TYPE_LABEL.waste}) —
          ไม่ผูกกับช่วงวันที่ของออเดอร์ด้านบน
        </Text>
      </div>
    </div>
  );
}
