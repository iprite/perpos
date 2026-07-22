"use client";

// efficiency-tab.tsx — เทียบ "ก่อน/หลังมีระบบ" จาก _fixtures/baseline.ts
// ค่า "ตอนนี้" คำนวณจาก fixture จริงผ่าน metrics.ts · ค่า "ก่อนมีระบบ" = ประมาณการจากเจ้าของร้าน
// บางแถว after = null (contract ไม่มี field ให้คำนวณ) → ต้องแสดงเหตุผล ไม่ใช่โชว์ 0

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/typography";
import { baselineComparison } from "../_fixtures/baseline";
import { benchmark } from "../_fixtures/benchmarks";
import type { MattiiOrder } from "../_fixtures/types";
import { SectionHeading, fmtNum, fmtPercent } from "../_components";

export function EfficiencyTab({ orders }: { orders: MattiiOrder[] }) {
  const rows = useMemo(() => baselineComparison(orders), [orders]);

  const leadRow = rows.find((r) => r.key === "lead_time_days");
  const lateRow = rows.find((r) => r.key === "late_rate_percent");
  const replyRow = rows.find((r) => r.key === "reply_time_minutes");

  const savedDays =
    leadRow && leadRow.after !== null ? Math.max(leadRow.before - leadRow.after, 0) : 0;
  const savedLate =
    lateRow && lateRow.after !== null ? Math.max(lateRow.before - lateRow.after, 0) : 0;
  const savedReply =
    replyRow && replyRow.after !== null ? Math.max(replyRow.before - replyRow.after, 0) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="ส่งของถึงมือลูกค้าเร็วขึ้น"
          value={`${fmtNum(savedDays, 1)} วัน/ออเดอร์`}
          sub="เทียบกับก่อนใช้ระบบ"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="งานส่งช้าลดลง"
          value={`${fmtNum(savedLate, 1)} จุด`}
          sub="สัดส่วนออเดอร์ที่เลยกำหนดลดลง"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="ตอบแชทเร็วขึ้น"
          value={`${fmtNum(savedReply)} นาที`}
          sub="จากการรวม 3 ช่องทางไว้กล่องเดียว"
          tone="positive"
          valueColored
        />
      </div>

      <div>
        <SectionHeading>ตัวชี้วัดก่อน/หลังมีระบบ</SectionHeading>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>ตัวชี้วัด</TableHead>
              <TableHead align="right">ก่อนมีระบบ</TableHead>
              <TableHead align="right">ตอนนี้</TableHead>
              <TableHead align="right">เปลี่ยนแปลง</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const has = row.after !== null;
              const diff = has ? (row.after as number) - row.before : 0;
              const better = row.lowerIsBetter ? diff < 0 : diff > 0;
              const flat = !has || Math.abs(diff) < 0.05;
              const Icon = flat ? Minus : diff < 0 ? ArrowDownRight : ArrowUpRight;
              return (
                <TableRow key={row.key}>
                  <TableCell wrap className="max-w-[22rem]">
                    <div className="text-gray-900">{row.label}</div>
                    {row.note && <div className="mt-0.5 text-xs text-gray-400">{row.note}</div>}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums text-gray-500">
                    {fmtNum(row.before, 1)} {row.unit}
                  </TableCell>
                  <TableCell align="right" className="font-medium tabular-nums text-gray-900">
                    {has ? `${fmtNum(row.after as number, 1)} ${row.unit}` : "ยังไม่มีข้อมูลเทียบ"}
                  </TableCell>
                  <TableCell align="right">
                    {has ? (
                      <span
                        className={
                          flat
                            ? "inline-flex items-center gap-1 tabular-nums text-gray-400"
                            : better
                              ? "inline-flex items-center gap-1 tabular-nums text-green-600"
                              : "inline-flex items-center gap-1 tabular-nums text-red-600"
                        }
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {fmtNum(Math.abs(diff), 1)} {row.unit}
                        {row.before > 0 && (
                          <span className="text-xs">
                            ({fmtPercent((Math.abs(diff) / row.before) * 100, 0)})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Text className="mt-2 px-1 text-xs text-gray-400">
          ค่า “ก่อนมีระบบ” เป็นค่าประมาณการจากเจ้าของร้าน ({benchmark.source_note})
          ใช้เพื่อเปรียบเทียบภาพรวม ไม่ใช่สถิติทางการ · ค่า “ตอนนี้” คำนวณจากงานที่เดินในระบบจริง
        </Text>
      </div>
    </div>
  );
}
