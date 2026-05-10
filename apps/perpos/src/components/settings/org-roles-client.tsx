"use client";

import React from "react";
import cn from "@core/utils/class-names";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OrgMemberRow } from "@/lib/settings/user-actions";

type RoleDef = {
  role: "owner" | "admin" | "member";
  label: string;
  description: string;
  color: string;
  capabilities: string[];
};

const ROLE_DEFS: RoleDef[] = [
  {
    role:         "owner",
    label:        "เจ้าของ",
    description:  "ควบคุมระบบได้ทั้งหมด รวมถึงการจัดการผู้ใช้และตั้งค่าองค์กร",
    color:        "bg-violet-50 text-violet-700",
    capabilities: ["จัดการผู้ใช้ทั้งหมด", "ตั้งค่าองค์กร", "เข้าถึงข้อมูลทุกส่วน", "ลบและแก้ไขข้อมูลทุกส่วน"],
  },
  {
    role:         "admin",
    label:        "ผู้ดูแลระบบ",
    description:  "จัดการผู้ใช้ได้ เข้าถึงข้อมูลได้ทั้งหมด แต่ไม่สามารถลบองค์กรได้",
    color:        "bg-blue-50 text-blue-700",
    capabilities: ["เชิญและจัดการผู้ใช้", "เข้าถึงข้อมูลทุกส่วน", "แก้ไขข้อมูลทุกส่วน"],
  },
  {
    role:         "member",
    label:        "สมาชิก",
    description:  "เข้าถึงและใช้งานระบบตามสิทธิ์พื้นฐาน ไม่สามารถจัดการผู้ใช้ได้",
    color:        "bg-slate-100 text-slate-600",
    capabilities: ["เข้าถึงข้อมูลทั่วไป", "สร้างและแก้ไขเอกสาร"],
  },
];

export function OrgRolesClient({ members }: { members: OrgMemberRow[] }) {
  const countByRole = (role: string) => members.filter((m) => m.role === role).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">ตั้งค่าสิทธิ์การใช้งาน</h1>
        <p className="mt-1 text-sm text-slate-500">ระดับสิทธิ์การเข้าถึงของผู้ใช้งานในองค์กร</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-8">#</TableHead>
              <TableHead>สิทธิ์การใช้งาน</TableHead>
              <TableHead>คำอธิบาย</TableHead>
              <TableHead>ความสามารถ</TableHead>
              <TableHead className="w-32 text-right">จำนวนผู้ใช้งาน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROLE_DEFS.map((def, i) => (
              <TableRow key={def.role} className="hover:bg-slate-50 align-top">
                <TableCell className="text-sm text-slate-400 pt-4">{i + 1}</TableCell>
                <TableCell className="pt-4">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", def.color)}>
                    {def.label}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-slate-600 pt-4 max-w-xs">
                  {def.description}
                </TableCell>
                <TableCell className="pt-4">
                  <ul className="space-y-1">
                    {def.capabilities.map((cap) => (
                      <li key={cap} className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shrink-0" />
                        {cap}
                      </li>
                    ))}
                  </ul>
                </TableCell>
                <TableCell className="text-right text-sm font-medium text-slate-700 pt-4">
                  {countByRole(def.role)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {members.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">ผู้ใช้งานทั้งหมด</h2>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>ชื่อผู้ใช้งาน</TableHead>
                  <TableHead>อีเมล</TableHead>
                  <TableHead className="w-36">สิทธิ์</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m, i) => (
                  <TableRow key={m.id} className="hover:bg-slate-50">
                    <TableCell className="text-sm text-slate-400">{i + 1}</TableCell>
                    <TableCell className="text-sm font-medium text-slate-900">
                      {m.display_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{m.email ?? "—"}</TableCell>
                    <TableCell>
                      {(() => {
                        const def = ROLE_DEFS.find((d) => d.role === m.role);
                        return (
                          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", def?.color ?? "bg-slate-100 text-slate-600")}>
                            {def?.label ?? m.role}
                          </span>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
