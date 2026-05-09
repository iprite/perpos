"use client";

import React, { useTransition } from "react";
import { Pencil, Power } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setAccountActiveAction } from "@/lib/accounting/accounts-actions";
import { formatType, type AccountRow, type AccountType } from "@/components/accounting/accounts-types";

export function AccountsCategorySection(props: {
  type: AccountType;
  rows: AccountRow[];
  canManage: boolean;
  activeOrganizationId: string;
  onEdit: (a: AccountRow) => void;
  onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{formatType(props.type)}</div>
          <div className="mt-0.5 text-xs text-slate-600">{props.rows.length} บัญชี</div>
        </div>
      </div>
      <div className="p-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">รหัส</TableHead>
              <TableHead>ชื่อบัญชี</TableHead>
              <TableHead className="w-[140px]">Normal</TableHead>
              <TableHead className="w-[120px]">สถานะ</TableHead>
              <TableHead className="w-[140px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.length ? (
              props.rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-sm">{a.code}</TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{a.name}</div>
                    {a.description ? <div className="mt-0.5 text-xs text-slate-600">{a.description}</div> : null}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-700">{a.normalBalance === "debit" ? "Debit" : "Credit"}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.isActive ? "success" : "danger"}>{a.isActive ? "ใช้งาน" : "ปิด"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={!props.canManage}
                        onClick={() => props.onEdit(a)}
                      >
                        <Pencil className="h-4 w-4" />
                        แก้ไข
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        disabled={!props.canManage || pending}
                        onClick={() => {
                          startTransition(async () => {
                            await setAccountActiveAction({
                              id: a.id,
                              organizationId: props.activeOrganizationId,
                              isActive: !a.isActive,
                            });
                            props.onRefresh();
                          });
                        }}
                      >
                        <Power className="h-4 w-4" />
                        {a.isActive ? "ปิด" : "เปิด"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-600">
                  ยังไม่มีบัญชีในหมวดนี้
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
