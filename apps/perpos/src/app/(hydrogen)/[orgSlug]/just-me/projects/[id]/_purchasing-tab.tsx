"use client";

/**
 * _purchasing-tab.tsx — แท็บ "จัดซื้อ" ของหน้าโครงการ
 * แสดงใบขอซื้อของโครงการนี้ + ลิงก์ไปหน้ารายละเอียด (ที่นั่นคือที่ทำงานจริง)
 * ⛔ แท็บนี้ถูก render เฉพาะ owner/manager เท่านั้น (viewer ไม่เห็นแท็บและไม่ได้รับข้อมูล)
 */

import { useRouter } from "next/navigation";
import { ExternalLink, ShoppingCart } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePagination, TablePager } from "@/components/ui/table-pager";
import { Text } from "@/components/ui/typography";
import { PR_STATUS_LABEL, PR_STATUS_TONE } from "@/lib/just-me/labels";
import { money, thaiDate } from "../../_components/format";
import type { ProjectPrRow } from "./_types";

export function PurchasingTab({ orgSlug, rows }: { orgSlug: string; rows: ProjectPrRow[] }) {
  const router = useRouter();
  const pager = usePagination(rows, { pageSize: 15 });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Text className="text-sm text-gray-500">
          ใบขอซื้อทั้งหมดของโครงการนี้ — กดที่แถวเพื่อเทียบราคาผู้ขาย/รับของ
        </Text>
        <Button
          size="sm"
          variant="outline"
          className="ms-auto"
          onClick={() => router.push(`/${orgSlug}/just-me/purchase-requests`)}
        >
          <ExternalLink className="h-4 w-4" /> ไปหน้าใบขอซื้อ
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่ใบ</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead>ต้องการใช้</TableHead>
            <TableHead>ผู้ขายที่เลือก</TableHead>
            <TableHead align="right">ยอดประเมิน</TableHead>
            <TableHead align="right">ยอดที่เลือก</TableHead>
            <TableHead align="right">รับของแล้ว</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pager.rows.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-2 py-6">
                <div className="rounded-full bg-gray-100 p-4">
                  <ShoppingCart className="h-8 w-8 text-gray-400" />
                </div>
                <Text className="text-sm font-medium text-gray-900">
                  ยังไม่มีใบขอซื้อของโครงการนี้
                </Text>
                <Text className="max-w-md text-sm text-gray-500">
                  อนุมัติ BOQ แล้วสร้างใบขอซื้อจากรายการที่ถอดไว้ ระบบจะคุมไม่ให้สั่งเกินปริมาณใน
                  BOQ ให้เอง
                </Text>
                <Button
                  size="sm"
                  onClick={() => router.push(`/${orgSlug}/just-me/purchase-requests`)}
                >
                  สร้างใบขอซื้อ
                </Button>
              </div>
            </TableEmpty>
          ) : (
            pager.rows.map((row) => (
              <TableRow
                key={row.id}
                clickable
                onClick={() => router.push(`/${orgSlug}/just-me/purchase-requests/${row.id}`)}
              >
                <TableCell className="font-mono text-xs text-gray-500">{row.pr_code}</TableCell>
                <TableCell align="center">
                  <StatusBadge tone={PR_STATUS_TONE[row.status]}>
                    {PR_STATUS_LABEL[row.status]}
                  </StatusBadge>
                </TableCell>
                <TableCell>{thaiDate(row.needed_date)}</TableCell>
                <TableCell>{row.vendor_name || "—"}</TableCell>
                <TableCell align="right" tabular>
                  {money(row.total_estimated_cost)}
                </TableCell>
                <TableCell align="right" tabular>
                  {money(row.total_selected_cost)}
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {row.received_count.toLocaleString("th-TH")} /{" "}
                  {row.item_count.toLocaleString("th-TH")}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <TablePager pager={pager} unit="ใบ" />
    </div>
  );
}
