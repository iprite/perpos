"use client";

// team-tab.tsx — จัดการทีมงาน (mattii_staff): เพิ่ม/แก้ชื่อ/เปลี่ยนบทบาท/ปิดใช้งาน
// 🔒 owner-only §2.3: คอลัมน์ "ค่าแรง/ชม." (hourly_rate) อยู่ท้ายสุด → role อื่นตัดทั้งคอลัมน์ (footer นับตาม)
// §5 ข้อ 3: ไม่มีปุ่มในแถว — คลิกแถวเปิด dialog

import { useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { STAFF_ROLE_LABEL } from "../_fixtures/labels";
import type { MattiiStaff } from "../_fixtures/types";
import { SectionHeading, fmtMoney, fmtNum, useMattiiRole } from "../_components";
import { StaffDialog } from "./staff-dialog";

export function TeamTab({
  staff,
  onChange,
}: {
  staff: MattiiStaff[];
  onChange: (updater: (prev: MattiiStaff[]) => MattiiStaff[]) => void;
}) {
  const { isOwner } = useMattiiRole();
  const [editing, setEditing] = useState<MattiiStaff | null | "new">(null);

  const colCount = isOwner ? 6 : 5;
  const activeCount = staff.filter((s) => s.is_active).length;
  const noLine = staff.filter((s) => s.is_active && !s.line_user_id).length;
  const wageTotal = useMemo(
    () => staff.filter((s) => s.is_active).reduce((sum, s) => sum + s.hourly_rate, 0),
    [staff],
  );

  return (
    <div className="space-y-3">
      <SectionHeading
        actions={
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มทีมงาน
          </Button>
        }
      >
        ทีมงานร้าน Mattii
      </SectionHeading>

      <Table className="shadow-sm" stickyHeader maxHeight="55vh">
        <TableHeader sticky>
          <TableRow>
            <TableHead>ชื่อ</TableHead>
            <TableHead>บทบาท</TableHead>
            <TableHead>เบอร์โทร</TableHead>
            <TableHead align="center">ผูก LINE</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            {isOwner && <TableHead align="right">ค่าแรง/ชม.</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.length === 0 ? (
            <TableEmpty colSpan={colCount}>
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="rounded-full bg-gray-100 p-4">
                  <Users className="h-7 w-7 text-gray-400" />
                </div>
                <div className="text-sm font-medium text-gray-900">ยังไม่มีทีมงานในระบบ</div>
                <div className="text-sm text-gray-500">
                  เพิ่มทีมงานคนแรกเพื่อมอบหมายงานและส่งแจ้งเตือน LINE ถึงตัวคนได้
                </div>
                <Button size="sm" className="mt-1" onClick={() => setEditing("new")}>
                  เพิ่มทีมงานคนแรก
                </Button>
              </div>
            </TableEmpty>
          ) : (
            staff.map((s) => (
              <TableRow key={s.id} clickable onClick={() => setEditing(s)}>
                <TableCell>
                  <span className="font-medium text-gray-900">{s.display_name}</span>
                </TableCell>
                <TableCell>{STAFF_ROLE_LABEL[s.role]}</TableCell>
                <TableCell className="tabular-nums">{s.phone ?? "—"}</TableCell>
                <TableCell align="center">
                  {s.line_user_id ? (
                    <StatusBadge tone="success">ผูกแล้ว</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">ยังไม่ผูก</StatusBadge>
                  )}
                </TableCell>
                <TableCell align="center">
                  {s.is_active ? (
                    <StatusBadge tone="info">ใช้งานอยู่</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">ปิดใช้งาน</StatusBadge>
                  )}
                </TableCell>
                {isOwner && (
                  <TableCell align="right" tabular>
                    {fmtMoney(s.hourly_rate)}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
        {staff.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>
                ใช้งานอยู่ {fmtNum(activeCount)} จาก {fmtNum(staff.length)} คน
              </TableCell>
              {isOwner && (
                <TableCell align="right" tabular>
                  {fmtMoney(wageTotal)}
                </TableCell>
              )}
            </TableRow>
          </TableFooter>
        )}
      </Table>

      <Text className="px-1 text-xs text-gray-500">
        คลิกที่แถวเพื่อแก้ไขข้อมูล เปลี่ยนบทบาท หรือปิดใช้งาน — คนที่ยังไม่ผูก LINE (
        {fmtNum(noLine)} คน) จะไม่ได้รับแจ้งเตือนจากระบบ
      </Text>

      {editing !== null && (
        <StaffDialog
          open
          staff={editing === "new" ? null : editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onSubmit={(next, mode) =>
            onChange((prev) =>
              mode === "create" ? [...prev, next] : prev.map((s) => (s.id === next.id ? next : s)),
            )
          }
        />
      )}
    </div>
  );
}
