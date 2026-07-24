"use client";

/**
 * RawRows — "ตารางข้อมูลดิบ" ของคำตอบ (contract §3.3 ข้อ 3)
 * พับเก็บไว้ กดเปิดได้เสมอ + คัดลอก/ดาวน์โหลด CSV + เตือนเมื่อผลถูกตัด (`truncated`)
 */

import * as React from "react";
import { ChevronDown, Copy, Download } from "lucide-react";
import { MINUS } from "@/lib/bi/format";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/toast";
import cn from "@core/utils/class-names";

type Row = Record<string, unknown>;

/** แถวสูงสุดที่แสดงบนจอ (ส่วนที่เหลือยังอยู่ใน CSV) */
const MAX_VISIBLE_ROWS = 100;

/** ตัวเลขในตารางดิบต้องใช้ U+2212 กับยอดลบเหมือนที่อื่นทั้งระบบ (DESIGN §2 · `lib/bi/format.ts`) */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    const body = new Intl.NumberFormat("en-US").format(Math.abs(v));
    return v < 0 && Number(body.replace(/,/g, "")) !== 0 ? `${MINUS}${body}` : body;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function isNumericColumn(rows: Row[], key: string): boolean {
  return rows.some((r) => typeof r[key] === "number");
}

function toCsv(rows: Row[], cols: string[]): string {
  const esc = (v: unknown) => {
    const s =
      v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function RawRows({
  rows,
  rowCount,
  columnLabels,
  title = "ข้อมูลดิบ",
}: {
  rows: Row[];
  rowCount: number;
  /** ชื่อคอลัมน์ภาษาไทย (จาก chart spec) — CSV ยังใช้คีย์ดิบเพื่อให้เอาไป pivot ต่อได้ */
  columnLabels?: Record<string, string>;
  title?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const cols = React.useMemo(() => {
    const set: string[] = [];
    for (const r of rows) for (const k of Object.keys(r)) if (!set.includes(k)) set.push(k);
    return set;
  }, [rows]);

  const visible = rows.slice(0, MAX_VISIBLE_ROWS);

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(rows, cols));
      notify.success("คัดลอกข้อมูลเป็น CSV แล้ว");
    } catch {
      notify.error(new Error("คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาต"), "คัดลอกไม่สำเร็จ");
    }
  };

  const downloadCsv = () => {
    const blob = new Blob(["﻿" + toCsv(rows, cols)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bi-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success("ดาวน์โหลดไฟล์ CSV แล้ว");
  };

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronDown
            className={cn("mr-1.5 h-4 w-4 transition-transform", open && "rotate-180")}
          />
          {title} ({new Intl.NumberFormat("en-US").format(rowCount)} แถว)
        </Button>
        {open ? (
          <>
            <Button variant="outline" size="sm" onClick={copyCsv}>
              <Copy className="mr-1.5 h-4 w-4" />
              คัดลอก CSV
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download className="mr-1.5 h-4 w-4" />
              ดาวน์โหลด CSV
            </Button>
          </>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-2">
          {/* คำเตือน truncated ถูกยกไปไว้เหนือกราฟใน AnswerCard — ต้องเห็นโดยไม่ต้องกดเปิดลิ้นชักนี้ */}
          <Table className="shadow-sm" maxHeight="60vh" stickyHeader>
            <TableHeader sticky>
              <TableRow>
                {cols.map((c) => (
                  <TableHead key={c} align={isNumericColumn(rows, c) ? "right" : "left"} title={c}>
                    {columnLabels?.[c] ?? c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableEmpty colSpan={cols.length}>ไม่มีข้อมูล</TableEmpty>
              ) : (
                visible.map((r, i) => (
                  <TableRow key={i}>
                    {cols.map((c) => {
                      const numeric = typeof r[c] === "number";
                      return (
                        <TableCell
                          key={c}
                          align={numeric ? "right" : "left"}
                          {...(numeric ? { tabular: true } : {})}
                        >
                          {cellText(r[c])}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {rows.length > MAX_VISIBLE_ROWS ? (
            <Text className="px-1 text-xs text-gray-500">
              แสดง {MAX_VISIBLE_ROWS} แถวแรกจาก {new Intl.NumberFormat("en-US").format(rows.length)}{" "}
              แถว — ดาวน์โหลด CSV เพื่อดูทั้งหมด
            </Text>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
