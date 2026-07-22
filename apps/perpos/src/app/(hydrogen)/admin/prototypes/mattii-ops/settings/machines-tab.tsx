"use client";

// machines-tab.tsx — จัดการเครื่องผลิต (mattii_machines): เพิ่ม/แก้ชื่อ/ประเภท/กำลังผลิตต่อวัน/สถานะ
// 🔒 owner-only §2.3: คอลัมน์ "ค่าเครื่อง/ชม." (hourly_cost) อยู่ท้ายสุด → role อื่นตัดทั้งคอลัมน์
// §5 ข้อ 3: ไม่มีปุ่มในแถว — คลิกแถวเปิด dialog

import { useState } from "react";
import { Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
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
import { MACHINE_KIND_LABEL, MACHINE_STATUS_LABEL } from "../_fixtures/labels";
import type { MachineStatus, MattiiMachine } from "../_fixtures/types";
import { SectionHeading, fmtMoney, fmtNum, useMattiiRole } from "../_components";
import { MachineDialog } from "./machine-dialog";

const STATUS_TONE: Record<MachineStatus, BadgeTone> = {
  idle: "success",
  running: "info",
  maintenance: "warning",
};

export function MachinesTab({
  machines,
  onChange,
}: {
  machines: MattiiMachine[];
  onChange: (updater: (prev: MattiiMachine[]) => MattiiMachine[]) => void;
}) {
  const { isOwner } = useMattiiRole();
  const [editing, setEditing] = useState<MattiiMachine | null | "new">(null);

  const colCount = isOwner ? 6 : 5;
  const capacityTotal = machines
    .filter((m) => m.status !== "maintenance")
    .reduce((s, m) => s + m.capacity_per_day, 0);
  const downCount = machines.filter((m) => m.status === "maintenance").length;

  return (
    <div className="space-y-3">
      <SectionHeading
        actions={
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มเครื่อง
          </Button>
        }
      >
        เครื่องผลิตในโรงงาน
      </SectionHeading>

      <Table className="shadow-sm" stickyHeader maxHeight="55vh">
        <TableHeader sticky>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อเครื่อง</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead align="right">กำลังผลิต/วัน</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            {isOwner && <TableHead align="right">ค่าเครื่อง/ชม.</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {machines.length === 0 ? (
            <TableEmpty colSpan={colCount}>
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="rounded-full bg-gray-100 p-4">
                  <Printer className="h-7 w-7 text-gray-400" />
                </div>
                <div className="text-sm font-medium text-gray-900">ยังไม่มีเครื่องผลิตในระบบ</div>
                <div className="text-sm text-gray-500">
                  เพิ่มเครื่องแรกเพื่อจัดคิวพิมพ์และดูกำลังผลิตต่อวันได้
                </div>
                <Button size="sm" className="mt-1" onClick={() => setEditing("new")}>
                  เพิ่มเครื่องแรก
                </Button>
              </div>
            </TableEmpty>
          ) : (
            machines.map((m) => (
              <TableRow key={m.id} clickable onClick={() => setEditing(m)}>
                <TableCell>
                  <span className="font-mono font-medium text-gray-900">{m.code}</span>
                </TableCell>
                <TableCell>
                  <div className="text-gray-900">{m.name}</div>
                  {m.note && <div className="text-xs text-gray-400">{m.note}</div>}
                </TableCell>
                <TableCell>{MACHINE_KIND_LABEL[m.machine_kind]}</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {fmtNum(m.capacity_per_day)} ผืน
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={STATUS_TONE[m.status]}>
                    {MACHINE_STATUS_LABEL[m.status]}
                  </StatusBadge>
                </TableCell>
                {isOwner && (
                  <TableCell align="right" tabular>
                    {fmtMoney(m.hourly_cost)}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
        {machines.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>กำลังผลิตรวมของเครื่องที่พร้อมใช้</TableCell>
              <TableCell align="right" className="tabular-nums">
                {fmtNum(capacityTotal)} ผืน
              </TableCell>
              <TableCell align="center">
                {downCount > 0 ? (
                  <StatusBadge tone="warning">ซ่อม {fmtNum(downCount)} เครื่อง</StatusBadge>
                ) : (
                  <StatusBadge tone="success">พร้อมใช้ทุกเครื่อง</StatusBadge>
                )}
              </TableCell>
              {isOwner && (
                <TableCell align="right" tabular>
                  {fmtMoney(machines.reduce((s, m) => s + m.hourly_cost, 0))}
                </TableCell>
              )}
            </TableRow>
          </TableFooter>
        )}
      </Table>

      <Text className="px-1 text-xs text-gray-500">
        คลิกที่แถวเพื่อแก้ไขเครื่อง — เครื่องที่อยู่สถานะ “ซ่อมบำรุง”
        จะไม่ถูกนับในกำลังผลิตต่อวันของคิวงาน
      </Text>

      {editing !== null && (
        <MachineDialog
          open
          machine={editing === "new" ? null : editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onSubmit={(next, mode) =>
            onChange((prev) =>
              mode === "create" ? [...prev, next] : prev.map((m) => (m.id === next.id ? next : m)),
            )
          }
        />
      )}
    </div>
  );
}
