"use client";

import React, { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";

import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listAuditLogsAction, type AuditLogRow } from "@/lib/phase4/security/actions";

export function AuditLogsClient(props: { organizationId: string; initialRows: AuditLogRow[] }) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(props.initialRows);
  const [tableName, setTableName] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AuditLogRow | null>(null);

  const refresh = () => {
    startTransition(async () => {
      const res = await listAuditLogsAction({ organizationId: props.organizationId, limit: 200, tableName: tableName || undefined, action: action || undefined });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRows(res.rows);
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid gap-1">
            <div className="text-xs text-slate-600">Table</div>
            <CustomSelect
              value={tableName}
              onChange={setTableName}
              className="w-44"
              placeholder="ทั้งหมด"
              options={[
                { value: "", label: "ทั้งหมด" },
                { value: "journal_entries",  label: "journal_entries" },
                { value: "journal_items",    label: "journal_items" },
                { value: "invoices",         label: "invoices" },
                { value: "wht_certificates", label: "wht_certificates" },
                { value: "bank_lines",       label: "bank_lines" },
                { value: "inventory_items",  label: "inventory_items" },
              ]}
            />
          </div>
          <div className="grid gap-1">
            <div className="text-xs text-slate-600">Action</div>
            <CustomSelect
              value={action}
              onChange={setAction}
              className="w-36"
              placeholder="ทั้งหมด"
              options={[
                { value: "",       label: "ทั้งหมด" },
                { value: "INSERT", label: "INSERT" },
                { value: "UPDATE", label: "UPDATE" },
                { value: "DELETE", label: "DELETE" },
              ]}
            />
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={refresh} disabled={pending}>
          <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : undefined)} />
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">เวลา</TableHead>
              <TableHead className="w-[110px]">Action</TableHead>
              <TableHead className="w-[160px]">Table</TableHead>
              <TableHead>Record</TableHead>
              <TableHead className="w-[140px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.createdAt.replace('T',' ').slice(0,19)}</TableCell>
                <TableCell>{r.action}</TableCell>
                <TableCell>{r.tableName}</TableCell>
                <TableCell className="font-mono text-xs">{r.recordId ?? "-"}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDetail(r);
                      setOpen(true);
                    }}
                  >
                    ดูรายละเอียด
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-600">
                  ไม่มีข้อมูล
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit Log Detail</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[520px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}



