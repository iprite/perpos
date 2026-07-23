"use client";

// movements-table.tsx — แท็บ "ความเคลื่อนไหวสต๊อก" (ledger)
// filter: วัสดุ / ประเภทการเคลื่อนไหว / ช่วงวัน — คลิกวัสดุจากแท็บแรกจะเข้ามาพร้อม filter วัสดุนั้น
// 🔒 owner-only §2.3: คอลัมน์ "มูลค่า" ซ่อนทั้งคอลัมน์ · จำนวนติดลบใช้ − (U+2212) + text-red-600

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
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
import { MATERIAL_UNIT_LABEL, STOCK_MOVE_TYPE_LABEL } from "../_fixtures/labels";
import type { MattiiMaterial, MattiiStockMovement, StockMoveType } from "../_fixtures/types";
import {
  FilterBar,
  SectionHeading,
  fmtDateTH,
  fmtMoney,
  fmtNum,
  useMattiiData,
  useMattiiRole,
} from "../_components";

const MOVE_TONE: Record<StockMoveType, BadgeTone> = {
  receive: "success",
  consume_print: "info",
  consume_pack: "info",
  adjust: "warning",
  waste: "danger",
  return: "success",
};

const TYPE_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  ...(Object.keys(STOCK_MOVE_TYPE_LABEL) as StockMoveType[]).map((k) => ({
    value: k as string,
    label: STOCK_MOVE_TYPE_LABEL[k],
  })),
];

export function MovementsTab({
  movements,
  materials,
  loading,
  materialId,
  onMaterialChange,
}: {
  movements: MattiiStockMovement[];
  materials: MattiiMaterial[];
  loading: boolean;
  materialId: string;
  onMaterialChange: (id: string) => void;
}) {
  const { isOwner } = useMattiiRole();
  const { orders, staffOf } = useMattiiData();

  const [moveType, setMoveType] = useState<StockMoveType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const materialOptions = useMemo(
    () => [
      { value: "", label: "ทุกวัสดุ" },
      ...materials.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` })),
    ],
    [materials],
  );

  const visible = useMemo(() => {
    return movements
      .filter((mv) => {
        if (materialId && mv.material_id !== materialId) return false;
        if (moveType && mv.move_type !== moveType) return false;
        const day = mv.occurred_at.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }, [movements, materialId, moveType, from, to]);

  const filtered = Boolean(materialId || moveType || from || to);
  const colCount = isOwner ? 8 : 7;
  const materialOf = (id: string) => materials.find((m) => m.id === id);
  const orderNoOf = (id: string | null) => (id ? orders.find((o) => o.id === id)?.order_no : null);

  return (
    <div>
      <SectionHeading>ความเคลื่อนไหวสต๊อก</SectionHeading>
      <FilterBar
        onClear={
          filtered
            ? () => {
                onMaterialChange("");
                setMoveType("");
                setFrom("");
                setTo("");
              }
            : undefined
        }
        resultText={`${fmtNum(visible.length)} / ${fmtNum(movements.length)} รายการ`}
      >
        <CustomSelect
          value={materialId}
          onChange={onMaterialChange}
          options={materialOptions}
          className="w-72"
        />
        <CustomSelect
          value={moveType}
          onChange={(v) => setMoveType(v as StockMoveType | "")}
          options={TYPE_OPTIONS}
          className="w-44"
        />
        <ThaiDatePicker value={from} onChange={setFrom} placeholder="ตั้งแต่วันที่" />
        <ThaiDatePicker value={to} onChange={setTo} placeholder="ถึงวันที่" />
      </FilterBar>

      <Table className="shadow-sm" stickyHeader maxHeight="60vh">
        <TableHeader sticky>
          <TableRow>
            <TableHead>วันที่</TableHead>
            <TableHead>วัสดุ</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead align="right">จำนวน</TableHead>
            <TableHead align="right">คงเหลือหลังรายการ</TableHead>
            <TableHead>ออเดอร์อ้างอิง</TableHead>
            <TableHead>ผู้บันทึก / เหตุผล</TableHead>
            {isOwner && <TableHead align="right">มูลค่า</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={colCount} />
          ) : visible.length === 0 ? (
            <TableEmpty colSpan={colCount}>
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="rounded-full bg-gray-100 p-4">
                  <ArrowLeftRight className="h-7 w-7 text-gray-400" />
                </div>
                <div className="text-sm font-medium text-gray-900">
                  ไม่พบความเคลื่อนไหวตามเงื่อนไขที่เลือก
                </div>
                <div className="text-sm text-gray-500">
                  ลองเปลี่ยนวัสดุ ประเภทการเคลื่อนไหว หรือช่วงวันที่
                </div>
                {filtered && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => {
                      onMaterialChange("");
                      setMoveType("");
                      setFrom("");
                      setTo("");
                    }}
                  >
                    ล้างตัวกรอง
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            visible.map((mv) => {
              const material = materialOf(mv.material_id);
              const unit = material ? MATERIAL_UNIT_LABEL[material.unit] : "";
              const staff = staffOf(mv.staff_id);
              const orderNo = orderNoOf(mv.order_id);
              return (
                <TableRow key={mv.id}>
                  <TableCell className="tabular-nums">{fmtDateTH(mv.occurred_at)}</TableCell>
                  <TableCell>{material?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge tone={MOVE_TONE[mv.move_type]}>
                      {STOCK_MOVE_TYPE_LABEL[mv.move_type]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell
                    align="right"
                    className={
                      mv.qty_delta < 0
                        ? "font-medium tabular-nums text-red-600"
                        : "font-medium tabular-nums text-green-600"
                    }
                  >
                    {`${mv.qty_delta > 0 ? "+" : ""}${fmtNum(mv.qty_delta, mv.qty_delta % 1 === 0 ? 0 : 3)} ${unit}`}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {`${fmtNum(mv.qty_after, mv.qty_after % 1 === 0 ? 0 : 3)} ${unit}`}
                  </TableCell>
                  <TableCell>
                    {orderNo ? <span className="font-mono">{orderNo}</span> : "—"}
                  </TableCell>
                  <TableCell wrap className="max-w-[22rem]">
                    <span className="text-gray-900">{staff?.display_name ?? "ระบบ"}</span>
                    {mv.reason && <span className="text-gray-500"> — {mv.reason}</span>}
                  </TableCell>
                  {isOwner && (
                    <TableCell align="right" tabular>
                      {fmtMoney(mv.total_cost)}
                    </TableCell>
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
