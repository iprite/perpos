"use client";

// materials-table.tsx — แท็บ "วัสดุ": filter หมวด + toggle เฉพาะใกล้หมด + ตารางคงเหลือ
// 🔒 owner-only §2.3: คอลัมน์ ต้นทุน/หน่วย + มูลค่าคงเหลือ อยู่ท้ายสุดติดกัน → role อื่นตัดทั้งชุด
// §5 ข้อ 3: ไม่มีปุ่มในแถว — คลิกแถวเปิด dialog (รับเข้า/ปรับยอดอยู่ใน DialogFooter)

import { useMemo, useState } from "react";
import { Boxes, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
} from "@/components/ui/table";
import { EMPTY_STATES } from "../_fixtures/empty-states";
import { MATERIAL_CATEGORY_LABEL, MATERIAL_UNIT_LABEL } from "../_fixtures/labels";
import { isLowStockMaterial } from "../_fixtures/metrics";
import type { MaterialCategory, MattiiMaterial } from "../_fixtures/types";
import { FilterBar, SectionHeading, fmtMoney, fmtNum, useMattiiRole } from "../_components";

/** เกณฑ์ "ใกล้หมด" — แหล่งเดียวคือ metrics.ts (ที่นี่แค่ re-export ให้ไฟล์ในโฟลเดอร์นี้ใช้ต่อ) */
export const isLowStock = isLowStockMaterial;

const CATEGORY_OPTIONS = [
  { value: "", label: "ทุกหมวด" },
  ...(Object.keys(MATERIAL_CATEGORY_LABEL) as MaterialCategory[]).map((k) => ({
    value: k as string,
    label: MATERIAL_CATEGORY_LABEL[k],
  })),
];

export type MaterialScope = "all" | "low";

export function MaterialsTab({
  materials,
  loading,
  onSelect,
  scope,
  onScopeChange,
}: {
  materials: MattiiMaterial[];
  loading: boolean;
  onSelect: (m: MattiiMaterial) => void;
  /** ควบคุมจากหน้า — การ์ด "วัสดุใกล้หมด" บนภาพรวมลิงก์มาด้วย `?low=1` */
  scope: MaterialScope;
  onScopeChange: (s: MaterialScope) => void;
}) {
  const { isOwner } = useMattiiRole();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<MaterialCategory | "">("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials
      .filter((m) => {
        if (q && !`${m.code} ${m.name} ${m.supplier_name ?? ""}`.toLowerCase().includes(q))
          return false;
        if (category && m.category !== category) return false;
        if (scope === "low" && !isLowStock(m)) return false;
        return true;
      })
      .sort((a, b) => Number(isLowStock(b)) - Number(isLowStock(a)));
  }, [materials, search, category, scope]);

  const filtered = Boolean(search || category || scope === "low");
  const colCount = isOwner ? 9 : 7;

  return (
    <div>
      <SectionHeading>รายการวัสดุ</SectionHeading>
      <FilterBar
        onClear={
          filtered
            ? () => {
                setSearch("");
                setCategory("");
                onScopeChange("all");
              }
            : undefined
        }
        resultText={`${fmtNum(visible.length)} / ${fmtNum(materials.length)} รายการ`}
      >
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหารหัส / ชื่อวัสดุ / ผู้ขาย"
            className="pl-9"
          />
        </div>
        <CustomSelect
          value={category}
          onChange={(v) => setCategory(v as MaterialCategory | "")}
          options={CATEGORY_OPTIONS}
          className="w-48"
        />
        <SegmentedControl
          value={scope}
          onChange={onScopeChange}
          size="sm"
          ariaLabel="ขอบเขตรายการวัสดุ"
          options={[
            { value: "all", label: "ทั้งหมด" },
            { value: "low", label: "เฉพาะใกล้หมด", activeClassName: "bg-red-600" },
          ]}
        />
      </FilterBar>

      <Table className="shadow-sm" stickyHeader maxHeight="60vh">
        <TableHeader sticky>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อวัสดุ</TableHead>
            <TableHead>หมวด</TableHead>
            <TableHead>หน่วย</TableHead>
            <TableHead align="right">คงเหลือ</TableHead>
            <TableHead align="right">จุดสั่งซื้อ</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            {isOwner && (
              <>
                <TableHead align="right">ต้นทุน/หน่วย</TableHead>
                <TableHead align="right">มูลค่าคงเหลือ</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={colCount} />
          ) : visible.length === 0 ? (
            <TableEmpty colSpan={colCount}>
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="rounded-full bg-gray-100 p-4">
                  <Boxes className="h-7 w-7 text-gray-400" />
                </div>
                <div className="text-sm font-medium text-gray-900">
                  {filtered ? EMPTY_STATES.materials.title : "ยังไม่มีวัสดุในระบบ"}
                </div>
                <div className="text-sm text-gray-500">
                  {filtered
                    ? EMPTY_STATES.materials.description
                    : "เพิ่มวัสดุแรกเพื่อให้ระบบตัดสต๊อกอัตโนมัติตอนพิมพ์และแพ็ค"}
                </div>
                {filtered && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => {
                      setSearch("");
                      setCategory("");
                      onScopeChange("all");
                    }}
                  >
                    {EMPTY_STATES.materials.ctaLabel}
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            visible.map((m) => {
              const low = isLowStock(m);
              return (
                <TableRow key={m.id} clickable onClick={() => onSelect(m)}>
                  <TableCell>
                    <span className="font-mono font-medium text-gray-900">{m.code}</span>
                  </TableCell>
                  <TableCell>{m.name}</TableCell>
                  <TableCell>{MATERIAL_CATEGORY_LABEL[m.category]}</TableCell>
                  <TableCell>{MATERIAL_UNIT_LABEL[m.unit]}</TableCell>
                  <TableCell
                    align="right"
                    className={low ? "font-semibold tabular-nums text-red-600" : "tabular-nums"}
                  >
                    {fmtNum(m.qty_on_hand, m.qty_on_hand % 1 === 0 ? 0 : 2)}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {fmtNum(m.reorder_point)}
                  </TableCell>
                  <TableCell align="center">
                    {low ? (
                      <StatusBadge tone="danger">ต่ำกว่าจุดสั่งซื้อ</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">พอใช้</StatusBadge>
                    )}
                  </TableCell>
                  {isOwner && (
                    <>
                      <TableCell align="right" tabular>
                        {fmtMoney(m.unit_cost)}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(m.stock_value)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
