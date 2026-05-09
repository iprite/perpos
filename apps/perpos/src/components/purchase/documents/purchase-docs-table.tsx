"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Search, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PurchaseDocStatusBadge } from "./purchase-doc-status-badge";
import { voidPurchaseDocumentAction } from "@/lib/purchase/documents/actions";
import type { PurchaseDocTypeConfig, AnyPurchaseDocStatus } from "./purchase-doc-type-config";
import type { OrganizationSummary } from "@/lib/accounting/queries";

export type PurchaseDocRow = {
  id:             string;
  organizationId: string;
  docNumber:      string | null;
  issueDate:      string;
  dueDate:        string | null;
  vendorName:     string;
  subTotal:       number;
  vatAmount:      number;
  totalAmount:    number;
  status:         AnyPurchaseDocStatus;
};

export function PurchaseDocsTable(props: {
  config:               PurchaseDocTypeConfig;
  organizations:        OrganizationSummary[];
  activeOrganizationId: string | null;
  rows:                 PurchaseDocRow[];
}) {
  const { config } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const activeOrg = props.activeOrganizationId;
  const canManage = useMemo(() => {
    if (!activeOrg) return false;
    const org = props.organizations.find((o) => o.id === activeOrg);
    return org?.role === "owner" || org?.role === "admin";
  }, [activeOrg, props.organizations]);

  const [q, setQ]               = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AnyPurchaseDocStatus>("all");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return props.rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!qq) return true;
      return `${r.docNumber ?? ""} ${r.vendorName}`.toLowerCase().includes(qq);
    });
  }, [props.rows, q, statusFilter]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาเลขที่/ชื่อผู้จำหน่าย"
              className="pl-9 w-72"
            />
          </div>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">ทุกสถานะ</option>
            {config.statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <Button onClick={() => router.push(`${config.path}/new`)} className="gap-2">
          สร้างเอกสารใหม่
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">วันที่</TableHead>
            <TableHead className="w-[180px]">เลขที่</TableHead>
            <TableHead>ผู้จำหน่าย</TableHead>
            <TableHead className="w-[140px] text-right">ยอดสุทธิ</TableHead>
            <TableHead className="w-[130px]">สถานะ</TableHead>
            <TableHead className="w-[160px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length ? (
            filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.issueDate}</TableCell>
                <TableCell className="font-mono text-sm">{r.docNumber ?? "-"}</TableCell>
                <TableCell>
                  <div className="font-medium text-slate-900">{r.vendorName}</div>
                  {r.dueDate ? (
                    <div className="mt-0.5 text-xs text-slate-600">
                      {config.docType === "purchase_order" ? "กำหนดส่ง" : "กำหนดชำระ"} {r.dueDate}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.totalAmount.toFixed(2)}</TableCell>
                <TableCell>
                  <PurchaseDocStatusBadge status={r.status} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" className="gap-2" disabled title="กำลังพัฒนา">
                      <FileDown className="h-4 w-4" />
                      PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      disabled={!canManage || pending || r.status === "voided" || r.status === "cancelled"}
                      onClick={() => {
                        if (!activeOrg) return;
                        startTransition(async () => {
                          const res = await voidPurchaseDocumentAction({ docId: r.id, organizationId: activeOrg });
                          if (!res.ok) toast.error(String(res.error));
                          else toast.success("ยกเลิกเอกสารแล้ว");
                          router.refresh();
                        });
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                      Void
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-600">
                ยังไม่มีเอกสาร{config.nameTh}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
