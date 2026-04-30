"use client";

import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "rizzui";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";

import type { ListedUser } from "@/components/admin-users/types";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";

function formatStatus(u: ListedUser) {
  if (u.last_sign_in_at) return "ใช้งานอยู่";
  if (u.invited_at) return "รอตั้งรหัส";
  return "-";
}

export default function UsersTable({
  items,
  loading,
  onReset,
  onDelete,
}: {
  items: ListedUser[];
  loading: boolean;
  onReset: (email: string) => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
}) {
  const confirmDialog = useConfirmDialog();
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const table = useReactTable({
    data: items,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-[1.2fr_0.6fr_0.6fr_0.8fr_0.8fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
        <div>ผู้ใช้</div>
        <div>Role</div>
        <div>สถานะ</div>
        <div>ผูกองค์กร/ตัวแทน</div>
        <div className="text-right">การทำงาน</div>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
      ) : (
        table.getRowModel().rows.map((row) => {
          const u = row.original as ListedUser;
          const r = u.profile?.role ?? "sale";
          const right =
            r === "employer"
              ? u.employer_org?.organization_name ?? u.employer_org?.organization_id ?? "-"
              : r === "representative"
                ? u.representative?.rep_code ?? u.representative?.id ?? "-"
                : "-";

          return (
            <div
              key={u.id}
              className="grid grid-cols-[1.2fr_0.6fr_0.6fr_0.8fr_0.8fr] items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
            >
              <div>
                <div className="text-sm text-gray-900">{u.email ?? "-"}</div>
              </div>
              <div className="text-sm font-medium text-gray-900">{r}</div>
              <div className="text-sm text-gray-700">{formatStatus(u)}</div>
              <div className="text-sm text-gray-700">{right}</div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={loading || !u.email} onClick={() => onReset(u.email ?? "")}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  disabled={loading}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: "ยืนยันลบผู้ใช้",
                      message: "ยืนยันลบผู้ใช้นี้? ผู้ใช้จะเข้าใช้งานไม่ได้อีก",
                      confirmText: "ลบ",
                      tone: "danger",
                    });
                    if (!ok) return;
                    await onDelete(u.id);
                    toast.success("ลบแล้ว");
                  }}
                >
                  ลบ
                </Button>
              </div>
            </div>
          );
        })
      )}
      <TablePagination table={table} />
    </div>
  );
}
