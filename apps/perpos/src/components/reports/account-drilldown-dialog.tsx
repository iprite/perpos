"use client";

import React, { useTransition } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAccountLedgerAction, type LedgerLine } from "@/lib/reports/actions";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AccountDrilldownDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  organizationId: string;
  accountId: string | null;
  startDate: string;
  endDate: string;
  onError: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = React.useState<LedgerLine[]>([]);
  const [count, setCount] = React.useState(0);

  const { open, accountId, organizationId, startDate, endDate, onError, title, onOpenChange } = props;

  React.useEffect(() => {
    if (!open) return;
    const id = accountId;
    if (!id) return;
    startTransition(async () => {
      const res = await getAccountLedgerAction({
        organizationId,
        accountId: id,
        startDate,
        endDate,
        limit: 50,
        offset: 0,
      });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      setRows(res.rows);
      setCount(res.count);
    });
  }, [open, accountId, organizationId, startDate, endDate, onError]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>รายละเอียดบัญชี: {title}</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-slate-600">แสดง {rows.length} รายการ จากทั้งหมด {count}</div>
        {pending ? <div className="mt-2 text-sm text-slate-500">กำลังโหลด…</div> : null}

        <div className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">วันที่</TableHead>
                <TableHead>คำอธิบาย</TableHead>
                <TableHead className="w-[120px] text-right">เดบิต</TableHead>
                <TableHead className="w-[120px] text-right">เครดิต</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={`${l.journalEntryId}-${l.lineNo}`}>
                  <TableCell>{l.entryDate}</TableCell>
                  <TableCell className="text-sm text-slate-900">{l.description ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(l.debit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(l.credit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
