"use client";

// design-table.tsx — ตารางคิวงานแบบลาย (DESIGN §5: row click เปิดรายละเอียด · ห้ามปุ่มในแถว)

import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  CfStatusBadge,
  DesignJobStatusBadge,
  DesignSourceBadge,
  fmtDateTH,
  fmtNum,
} from "../_components";
import type { DesignJobView } from "./use-design-state";

export function DesignTable({
  rows,
  filtered,
  onSelect,
  onClearFilters,
}: {
  rows: DesignJobView[];
  /** ว่างเพราะตัวกรอง (ไม่ใช่ไม่มีข้อมูลเลย) */
  filtered: boolean;
  onSelect: (view: DesignJobView) => void;
  onClearFilters: () => void;
}) {
  return (
    <Table className="shadow-sm" stickyHeader maxHeight="65vh">
      <TableHeader sticky>
        <TableRow>
          <TableHead>งานแบบ</TableHead>
          <TableHead>ออเดอร์ / ลูกค้า</TableHead>
          <TableHead>ที่มาของลาย</TableHead>
          <TableHead>สถานะงานแบบ</TableHead>
          <TableHead>การยืนยันจากลูกค้า</TableHead>
          <TableHead>เวอร์ชันไฟล์</TableHead>
          <TableHead>ผู้รับผิดชอบ</TableHead>
          <TableHead align="right">กำหนดส่งงานแบบ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={8}>
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="rounded-full bg-gray-100 p-4">
                <Palette className="h-7 w-7 text-gray-400" />
              </div>
              <div className="text-sm font-medium text-gray-900">
                {filtered ? "ไม่พบงานแบบตามเงื่อนไขที่เลือก" : "ยังไม่มีงานแบบในระบบ"}
              </div>
              <div className="text-sm text-gray-500">
                {filtered
                  ? "ลองล้างตัวกรองสถานะ/ผู้รับผิดชอบ หรือเปลี่ยนคำค้นหา"
                  : "งานแบบจะถูกสร้างอัตโนมัติเมื่อยืนยันออเดอร์"}
              </div>
              {filtered && (
                <Button size="sm" variant="outline" className="mt-1" onClick={onClearFilters}>
                  ล้างตัวกรอง
                </Button>
              )}
            </div>
          </TableEmpty>
        ) : (
          rows.map((v) => (
            <TableRow key={v.job.id} clickable onClick={() => onSelect(v)}>
              <TableCell>
                <span className="font-mono font-medium text-gray-900">{v.job.job_no}</span>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-gray-500">
                    {v.order?.order_no ?? "—"}
                  </span>
                  <span>{v.customer?.display_name ?? "—"}</span>
                </div>
              </TableCell>
              <TableCell>
                <DesignSourceBadge source={v.job.design_source} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <DesignJobStatusBadge status={v.job.status} />
                  {v.job.revision_count > 0 && (
                    <StatusBadge tone="warning">แก้ {fmtNum(v.job.revision_count)} รอบ</StatusBadge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <CfStatusBadge status={v.job.cf_status} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <span className="tabular-nums text-gray-900">
                    {v.versions.length > 0 ? `v${v.latest?.version_no}` : "—"}
                  </span>
                  {v.approved ? (
                    <StatusBadge tone="success">ยืนยัน v{v.approved.version_no}</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">ยังไม่มีเวอร์ชันที่ยืนยัน</StatusBadge>
                  )}
                </div>
              </TableCell>
              <TableCell>{v.designer?.display_name ?? "ยังไม่มอบหมาย"}</TableCell>
              <TableCell align="right" className="tabular-nums">
                {fmtDateTH(v.job.due_at)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
