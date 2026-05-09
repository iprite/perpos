"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileDown, Search, XCircle, Layers3 } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge, type InvoiceStatus } from "@/components/sales/invoices/invoice-status-badge";
import { markInvoicePaidAction, voidInvoiceAction } from "@/lib/sales/invoices/actions";
import { postInvoiceCogsAction } from "@/lib/phase4/inventory/actions";
import type { OrganizationSummary } from "@/lib/accounting/queries";

export type InvoiceRow = {
  id: string;
  organizationId: string;
  invoiceNumber: string | null;
  issueDate: string;
  dueDate: string | null;
  customerName: string;
  subTotal: number;
  vatAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  postedJournalEntryId: string | null;
  cogsJournalEntryId?: string | null;
};

function isOverdue(row: InvoiceRow) {
  if (row.status !== "sent") return false;
  if (!row.dueDate) return false;
  return new Date(row.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
}

export function InvoicesTable(props: {
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  rows: InvoiceRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const activeOrg = props.activeOrganizationId;
  const canManage = useMemo(() => {
    if (!activeOrg) return false;
    const org = props.organizations.find((o) => o.id === activeOrg);
    return org?.role === "owner" || org?.role === "admin";
  }, [activeOrg, props.organizations]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return props.rows
      .map((r) => ({ ...r, status: isOverdue(r) ? ("overdue" as const) : r.status }))
      .filter((r) => {
        if (status !== "all" && r.status !== status) return false;
        if (!qq) return true;
        const hay = `${r.invoiceNumber ?? ""} ${r.customerName}`.toLowerCase();
        return hay.includes(qq);
      });
  }, [props.rows, q, status]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาเลขที่/ชื่อลูกค้า"
              className="pl-9 w-72"
            />
          </div>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="all">ทุกสถานะ</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </div>

        <Button onClick={() => router.push("/sales/invoices/new")} className="gap-2">
          สร้างเอกสารใหม่
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">วันที่</TableHead>
            <TableHead className="w-[180px]">เลขที่</TableHead>
            <TableHead>ลูกค้า</TableHead>
            <TableHead className="w-[140px] text-right">ยอดสุทธิ</TableHead>
            <TableHead className="w-[140px]">สถานะ</TableHead>
            <TableHead className="w-[220px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length ? (
            filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.issueDate}</TableCell>
                <TableCell className="font-mono text-sm">{r.invoiceNumber ?? "-"}</TableCell>
                <TableCell>
                  <div className="font-medium text-slate-900">{r.customerName}</div>
                  {r.dueDate ? <div className="mt-0.5 text-xs text-slate-600">กำหนดชำระ {r.dueDate}</div> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.totalAmount.toFixed(2)}</TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={r.status} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled
                      title="กำลังพัฒนา"
                    >
                      <FileDown className="h-4 w-4" />
                      PDF
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={!canManage || pending || !(r.status === "sent" || r.status === "overdue" || r.status === "paid") || !!r.cogsJournalEntryId}
                      onClick={() => {
                        if (!activeOrg) return;
                        startTransition(async () => {
                          const res = await postInvoiceCogsAction({ invoiceId: r.id, organizationId: activeOrg });
                          if (!res.ok) {
                            toast.error(String(res.error));
                          } else if (!res.journalEntryId) {
                            toast.error("ไม่พบรายการสต๊อกในใบแจ้งหนี้นี้");
                          } else {
                            toast.success("โพสต์ COGS แล้ว");
                          }
                          router.refresh();
                        });
                      }}
                    >
                      <Layers3 className="h-4 w-4" />
                      Post COGS
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={!canManage || pending || !(r.status === "sent" || r.status === "overdue")}
                      onClick={() => {
                        if (!activeOrg) return;
                        startTransition(async () => {
                          await markInvoicePaidAction({ invoiceId: r.id, organizationId: activeOrg });
                          router.refresh();
                        });
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark Paid
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      disabled={!canManage || pending || r.status === "void"}
                      onClick={() => {
                        if (!activeOrg) return;
                        startTransition(async () => {
                          await voidInvoiceAction({ invoiceId: r.id, organizationId: activeOrg });
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
                ยังไม่มีใบแจ้งหนี้
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
