"use client";

import React, { useMemo, useState, useTransition } from "react";
import { pdf } from "@react-pdf/renderer";
import { Download, FilePlus2, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import cn from "@core/utils/class-names";
import { createWhtCertificateAction, postWhtLiabilityAutoAction, uploadWhtPdfAction } from "@/lib/phase4/wht/actions";
import { WhtCertificatePdf, type WhtPdfData } from "@/components/phase4/wht/wht-pdf";

export type WhtRow = {
  id: string;
  certificateNo: string | null;
  whtDate: string;
  receiverName: string;
  baseAmount: number;
  whtAmount: number;
  status: "draft" | "issued" | "void" | string;
  postedJournalEntryId: string | null;
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function WhtDocumentsClient(props: {
  organizationId: string;
  rows: WhtRow[];
  payerPrefill?: { name?: string; taxId?: string; address?: string };
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(props.rows);

  const [form, setForm] = useState({
    whtDate: new Date().toISOString().slice(0, 10),
    payerName: props.payerPrefill?.name ?? "",
    payerTaxId: props.payerPrefill?.taxId ?? "",
    payerAddress: props.payerPrefill?.address ?? "",
    receiverName: "",
    receiverTaxId: "",
    receiverAddress: "",
    whtCategory: "บริการ",
    whtRate: "0.03",
    baseAmount: "0",
    notes: "",
  });

  const computed = useMemo(() => {
    const base = Number(form.baseAmount || 0);
    const rate = Number(form.whtRate || 0);
    const wht = Math.round(base * rate * 100) / 100;
    return { wht };
  }, [form.baseAmount, form.whtRate]);

  const refresh = () => {
    location.reload();
  };

  const createAndDownload = () => {
    startTransition(async () => {
      const base = Number(form.baseAmount || 0);
      const rate = Number(form.whtRate || 0);
      if (!form.receiverName.trim()) {
        toast.error("กรุณากรอกผู้ถูกหักภาษี");
        return;
      }
      if (!Number.isFinite(base) || base <= 0) {
        toast.error("ฐานภาษีต้องมากกว่า 0");
        return;
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.error("อัตรา WHT ไม่ถูกต้อง");
        return;
      }

      const res = await createWhtCertificateAction({
        organizationId: props.organizationId,
        whtDate: form.whtDate,
        payerName: form.payerName || "บริษัท",
        payerTaxId: form.payerTaxId,
        payerAddress: form.payerAddress,
        receiverName: form.receiverName,
        receiverTaxId: form.receiverTaxId,
        receiverAddress: form.receiverAddress,
        whtCategory: form.whtCategory,
        whtRate: rate,
        baseAmount: base,
        notes: form.notes,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      const post = await postWhtLiabilityAutoAction({ organizationId: props.organizationId, whtId: res.whtId });
      if (!post.ok) toast.error(String(post.error));

      const certNo = res.certificateNo ?? "WHT";

      const pdfData: WhtPdfData = {
        certificateNo: certNo,
        whtDate: form.whtDate,
        payer: { name: form.payerName || "บริษัท", taxId: form.payerTaxId || undefined, address: form.payerAddress || undefined },
        receiver: { name: form.receiverName, taxId: form.receiverTaxId || undefined, address: form.receiverAddress || undefined },
        category: form.whtCategory,
        ratePct: `${(rate * 100).toFixed(0)}%`,
        baseAmount: fmt(base),
        whtAmount: fmt(computed.wht),
      };

      const instance = pdf(<WhtCertificatePdf data={pdfData} />);
      const blob = await instance.toBlob();

      const file = new File([blob], `wht-${res.whtId}.pdf`, { type: "application/pdf" });
      const up = await uploadWhtPdfAction({ organizationId: props.organizationId, whtId: res.whtId, file });
      if (!up.ok) {
        toast.error(String(up.error));
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `WHT-50Tawi-${pdfData.certificateNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("ออกใบหัก ณ ที่จ่ายแล้ว");
      setOpen(false);
      refresh();
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">เอกสาร WHT (50 ทวิ)</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={refresh} disabled={pending}>
            <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : undefined)} />
            Refresh
          </Button>
          <Button className="gap-2" onClick={() => setOpen(true)}>
            <FilePlus2 className="h-4 w-4" />
            สร้าง WHT
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">เลขที่</TableHead>
              <TableHead className="w-[120px]">วันที่</TableHead>
              <TableHead>ผู้ถูกหักภาษี</TableHead>
              <TableHead className="w-[140px] text-right">ฐานภาษี</TableHead>
              <TableHead className="w-[140px] text-right">WHT</TableHead>
              <TableHead className="w-[120px]">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.certificateNo ?? "-"}</TableCell>
                  <TableCell>{r.whtDate}</TableCell>
                  <TableCell className="text-sm text-slate-900">{r.receiverName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.baseAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.whtAmount)}</TableCell>
                  <TableCell className="text-sm">{r.status}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-600">
                  ยังไม่มีเอกสาร WHT
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>สร้างใบรับรองหัก ณ ที่จ่าย (50 ทวิ)</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>วันที่</Label>
              <Input type="date" value={form.whtDate} onChange={(e) => setForm((s) => ({ ...s, whtDate: e.target.value }))} />
            </div>

            <div className="grid gap-2">
              <Label>ผู้หักภาษี (ผู้จ่ายเงิน)</Label>
              <Input value={form.payerName} onChange={(e) => setForm((s) => ({ ...s, payerName: e.target.value }))} placeholder="ชื่อบริษัท" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={form.payerTaxId} onChange={(e) => setForm((s) => ({ ...s, payerTaxId: e.target.value }))} placeholder="เลขผู้เสียภาษี" />
                <Input value={form.payerAddress} onChange={(e) => setForm((s) => ({ ...s, payerAddress: e.target.value }))} placeholder="ที่อยู่" />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>ผู้ถูกหักภาษี (ผู้รับเงิน)</Label>
              <Input value={form.receiverName} onChange={(e) => setForm((s) => ({ ...s, receiverName: e.target.value }))} placeholder="ชื่อผู้รับเงิน" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={form.receiverTaxId} onChange={(e) => setForm((s) => ({ ...s, receiverTaxId: e.target.value }))} placeholder="เลขผู้เสียภาษี" />
                <Input value={form.receiverAddress} onChange={(e) => setForm((s) => ({ ...s, receiverAddress: e.target.value }))} placeholder="ที่อยู่" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>หมวด WHT</Label>
                <Input value={form.whtCategory} onChange={(e) => setForm((s) => ({ ...s, whtCategory: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>อัตรา</Label>
                <CustomSelect
                  value={form.whtRate}
                  onChange={(v) => setForm((s) => ({ ...s, whtRate: v }))}
                  options={[
                    { value: "0.01", label: "1%" },
                    { value: "0.03", label: "3%" },
                    { value: "0.05", label: "5%" },
                    { value: "0.10", label: "10%" },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>ฐานภาษี</Label>
                <Input inputMode="decimal" value={form.baseAmount} onChange={(e) => setForm((s) => ({ ...s, baseAmount: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>ภาษีหัก ณ ที่จ่าย (คำนวณ)</Label>
                <Input value={fmt(computed.wht)} readOnly />
              </div>
            </div>

            <div className="flex justify-end">
              <Button className="gap-2" onClick={createAndDownload} disabled={pending}>
                <Download className="h-4 w-4" />
                ออกเอกสาร + ดาวน์โหลด PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
