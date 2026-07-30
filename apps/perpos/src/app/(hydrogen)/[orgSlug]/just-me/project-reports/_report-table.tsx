/**
 * _report-table.tsx — ตารางเทียบงบข้ามโครงการ (server component, display ล้วน)
 * ⛔ ไม่คำนวณเงินเอง — ทุกช่องรับค่าที่ `project-metrics.ts` คิดมาแล้ว
 * กติกา: null = "—" · ค่าประมาณการติด ≈ · แถวที่เกินงบไฮไลต์แดง (เรียงมาก่อนแล้วจากหน้า)
 */

import Link from "next/link";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LinkTablePager } from "@/components/ui/table-pager";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/lib/just-me/labels";
import type { ProjectStatus } from "@/lib/just-me/types";
import { money, percent } from "../_components/format";

export interface ReportRow {
  id: string;
  project_code: string;
  name: string;
  status: ProjectStatus;
  contract_amount: number | null;
  budget_cost: number | null;
  actual_cost: number;
  committed_cost: number;
  /** บวก = ใช้เกินงบ · null = ยังไม่มีงบ */
  cost_variance: number | null;
  progress_pct: number | null;
  forecast_profit: number | null;
  over_budget: boolean;
}

export function ReportTable({
  rows,
  total,
  page,
  pageSize,
  orgSlug,
  query,
}: {
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  orgSlug: string;
  query: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      <div className="px-1 text-sm font-semibold text-gray-900">
        เทียบงบรายโครงการ (เรียงโครงการที่เสี่ยงก่อน)
      </div>
      <Table stickyHeader className="shadow-sm">
        <TableHeader sticky>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>โครงการ</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead align="right">มูลค่าสัญญา</TableHead>
            <TableHead align="right">งบต้นทุน</TableHead>
            <TableHead align="right">ใช้จริง</TableHead>
            <TableHead align="right">ผูกพัน</TableHead>
            <TableHead align="right">เทียบงบ (+ = เกิน)</TableHead>
            <TableHead align="right">คืบหน้า</TableHead>
            <TableHead align="right">กำไรคาดการณ์ ≈</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={10}>
              ยังไม่มีโครงการที่ตรงกับตัวกรอง — ลองล้างตัวกรอง หรือเริ่มจากอนุมัติ BOQ
              เพื่อให้มีงบต้นทุนไว้เทียบ
            </TableEmpty>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id} className={r.over_budget ? "bg-red-50" : undefined}>
                <TableCell>
                  <Link
                    href={`/${orgSlug}/just-me/projects/${r.id}`}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {r.project_code}
                  </Link>
                </TableCell>
                <TableCell wrap>{r.name}</TableCell>
                <TableCell align="center">
                  <StatusBadge tone={PROJECT_STATUS_TONE[r.status]}>
                    {PROJECT_STATUS_LABEL[r.status]}
                  </StatusBadge>
                </TableCell>
                <TableCell align="right" tabular>
                  {money(r.contract_amount)}
                </TableCell>
                <TableCell align="right" tabular>
                  {money(r.budget_cost)}
                </TableCell>
                <TableCell align="right" tabular>
                  {money(r.actual_cost)}
                </TableCell>
                <TableCell align="right" tabular>
                  {money(r.committed_cost)}
                </TableCell>
                <TableCell
                  align="right"
                  tabular
                  className={
                    r.cost_variance === null
                      ? undefined
                      : r.cost_variance > 0
                        ? "font-semibold text-red-600"
                        : "text-green-600"
                  }
                >
                  {money(r.cost_variance)}
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {r.progress_pct === null ? (
                    <span className="text-xs text-gray-400">ยังไม่ได้บันทึกความคืบหน้า</span>
                  ) : (
                    percent(r.progress_pct)
                  )}
                </TableCell>
                <TableCell
                  align="right"
                  tabular
                  className={
                    r.forecast_profit === null
                      ? undefined
                      : r.forecast_profit < 0
                        ? "text-red-600"
                        : "text-green-600"
                  }
                >
                  {r.forecast_profit === null ? "—" : `≈ ${money(r.forecast_profit)}`}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <LinkTablePager page={page} pageSize={pageSize} total={total} query={query} unit="โครงการ" />
    </div>
  );
}
