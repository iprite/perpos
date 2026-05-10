"use client";

import React, { useState, useTransition } from "react";
import { CheckCircle2, Circle, ChevronDown, Printer } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import cn from "@core/utils/class-names";
import { updatePP30Status, type PP30Row, type VatDocRow } from "@/lib/tax/actions";
import { PP30FormPreview } from "@/components/tax/pp30-form-preview";

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft:     { label: "ร่าง",       color: "text-slate-600", dot: "bg-slate-400" },
  submitted: { label: "ยื่นแล้ว",   color: "text-blue-700",  dot: "bg-blue-500" },
  paid:      { label: "ชำระแล้ว",  color: "text-amber-700", dot: "bg-amber-500" },
  received:  { label: "รับใบเสร็จ", color: "text-teal-700",  dot: "bg-teal-500" },
};

const STATUS_ORDER = ["draft", "submitted", "paid", "received"];
const STATUS_LABELS = ["สร้าง ภ.พ.30", "ยื่นแบบ", "ชำระเงิน", "รับใบเสร็จ"];

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

type Tab = "document" | "sales" | "purchases" | "history";

type Props = {
  organizationId: string;
  row: PP30Row;
  salesRows: VatDocRow[];
  purchaseRows: VatDocRow[];
  orgName?: string;
  orgTaxId?: string;
  orgAddress?: string;
};

export function PP30DetailClient({
  organizationId,
  row: initialRow,
  salesRows,
  purchaseRows,
  orgName,
  orgTaxId,
  orgAddress,
}: Props) {
  const [row, setRow] = useState(initialRow);
  const [tab, setTab] = useState<Tab>("document");
  const [pending, startTransition] = useTransition();
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<PP30Row["status"]>(row.status);
  const [paymentAmount, setPaymentAmount] = useState(String(row.payment_amount ?? row.net_vat));
  const [paymentRef, setPaymentRef] = useState(row.payment_ref ?? "");
  const [receiptRef, setReceiptRef] = useState(row.receipt_ref ?? "");
  const [submittedAt, setSubmittedAt] = useState(row.submitted_at ?? new Date().toISOString().slice(0, 10));

  const currentStepIdx = STATUS_ORDER.indexOf(row.status);

  const statusCfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.draft;
  const monthTh = THAI_MONTHS_FULL[(row.period_month ?? 1) - 1];
  const beYear = row.period_year + 543;

  const handleStatusUpdate = () => {
    startTransition(async () => {
      const res = await updatePP30Status({
        organizationId,
        id: row.id,
        status: newStatus,
        payment_amount: Number(paymentAmount) || undefined,
        payment_ref: paymentRef || undefined,
        receipt_ref: receiptRef || undefined,
        submitted_at: submittedAt || undefined,
      });
      if (!res.ok) {
        toast.error((res as any).error);
        return;
      }
      setRow((prev) => ({
        ...prev,
        status: newStatus,
        payment_amount: Number(paymentAmount) || prev.payment_amount,
        payment_ref: paymentRef || prev.payment_ref,
        receipt_ref: receiptRef || prev.receipt_ref,
        submitted_at: submittedAt || prev.submitted_at,
      }));
      setStatusOpen(false);
      toast.success("อัปเดตสถานะเรียบร้อย");
    });
  };

  const salesVatTotal = salesRows.reduce((s, r) => s + r.vat_amount, 0);
  const purchasesVatTotal = purchaseRows.reduce((s, r) => s + r.vat_amount, 0);
  const salesBaseTotal = salesRows.reduce((s, r) => s + r.sub_total, 0);
  const purchasesBaseTotal = purchaseRows.reduce((s, r) => s + r.sub_total, 0);

  const tabs: { id: Tab; label: string }[] = [
    { id: "document", label: "ข้อมูลเอกสาร" },
    { id: "sales", label: `รายการภาษีขาย (${salesRows.length})` },
    { id: "purchases", label: `รายการภาษีซื้อ (${purchaseRows.length})` },
    { id: "history", label: "ข้อมูลประวัติ" },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left panel - 2/3 */}
      <div className="flex-1 min-w-0">
        {/* Stepper */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
          <div className="flex items-center">
            {STATUS_LABELS.map((label, idx) => {
              const done = idx <= currentStepIdx;
              const active = idx === currentStepIdx;
              return (
                <React.Fragment key={label}>
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full border-2 flex items-center justify-center",
                        done
                          ? "border-teal-500 bg-teal-500 text-white"
                          : "border-slate-300 text-slate-300"
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs text-center leading-tight",
                        active ? "font-semibold text-teal-700" : done ? "text-slate-700" : "text-slate-400"
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {idx < STATUS_LABELS.length - 1 && (
                    <div
                      className={cn(
                        "h-px flex-1 mx-1 border-t-2 border-dashed",
                        idx < currentStepIdx ? "border-teal-400" : "border-slate-200"
                      )}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-teal-500 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "document" && (
          <PP30FormPreview
            row={row}
            orgName={orgName}
            orgTaxId={orgTaxId}
            orgAddress={orgAddress}
            outputBase={salesBaseTotal || undefined}
            inputBase={purchasesBaseTotal || undefined}
          />
        )}

        {tab === "sales" && (
          <VatDocTable rows={salesRows} emptyLabel="ไม่พบรายการภาษีขายในงวดนี้" />
        )}

        {tab === "purchases" && (
          <VatDocTable rows={purchaseRows} emptyLabel="ไม่พบรายการภาษีซื้อในงวดนี้" />
        )}

        {tab === "history" && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <div className="font-semibold text-slate-800 mb-4">ประวัติการดำเนินการ</div>
            <HistoryItem label="สร้างเอกสาร" date={fmtDate(row.created_at)} done />
            <HistoryItem label="ยื่นแบบ" date={row.submitted_at ? fmtDate(row.submitted_at) : null} done={!!row.submitted_at} />
            <HistoryItem label="ชำระเงิน" date={row.payment_ref ?? null} done={row.status === "paid" || row.status === "received"} />
            <HistoryItem label="รับใบเสร็จ" date={row.receipt_ref ?? null} done={row.status === "received"} />
          </div>
        )}
      </div>

      {/* Right panel - 1/3 */}
      <div className="lg:w-80 shrink-0 space-y-4">
        {/* Title card */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <div className="font-semibold text-slate-900">ภ.พ.30 {monthTh}/{beYear}</div>
              <div className="text-xs text-slate-500 mt-0.5">{row.filing_number}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                พิมพ์
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex items-center gap-1"
                onClick={() => setStatusOpen(true)}
              >
                ตัวเลือก
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 py-2 border-t border-slate-100">
            <span className={cn("inline-block w-2 h-2 rounded-full", statusCfg.dot)} />
            <span className={cn("text-sm font-medium", statusCfg.color)}>{statusCfg.label}</span>
          </div>
        </div>

        {/* Filing info */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="font-medium text-slate-800 text-sm">ยื่นแบบฟอร์มและชำระเงิน</div>
          <TimelineItem
            label="ยื่นแบบ"
            value={row.submitted_at ? fmtDate(row.submitted_at) : "รอดำเนินการ"}
            done={!!row.submitted_at}
          />
          <TimelineItem
            label="ชำระเงิน"
            value={row.payment_ref ? `อ้างอิง: ${row.payment_ref}` : "รอดำเนินการ"}
            done={!!row.payment_ref}
          />
          {row.payment_amount != null && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">จำนวนเงิน</span>
              <span className="font-medium">{fmt(row.payment_amount)} บาท</span>
            </div>
          )}
          <TimelineItem
            label="รับใบเสร็จ"
            value={row.receipt_ref ? `เลขที่: ${row.receipt_ref}` : "รอดำเนินการ"}
            done={!!row.receipt_ref}
          />
        </div>

        {/* Basic info */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="font-medium text-slate-800 text-sm mb-3">ข้อมูลพื้นฐาน</div>
          <InfoRow label="งวดภาษี" value={`${monthTh} ${beYear}`} />
          <InfoRow label="ภาษีขาย" value={`${fmt(row.output_vat_total)} บาท`} />
          <InfoRow label="ภาษีซื้อ" value={`${fmt(row.input_vat_total)} บาท`} />
          <InfoRow
            label="ยอดสุทธิ"
            value={`${fmt(row.net_vat)} บาท`}
            valueClass={row.net_vat > 0 ? "text-red-600 font-semibold" : "text-teal-600 font-semibold"}
          />
          <InfoRow label="รายการขาย" value={`${salesRows.length} รายการ`} />
          <InfoRow label="รายการซื้อ" value={`${purchaseRows.length} รายการ`} />
          <InfoRow label="สร้างเมื่อ" value={fmtDate(row.created_at)} />
        </div>
      </div>

      {/* Update status dialog */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>อัปเดตสถานะ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>สถานะ</Label>
              <CustomSelect
                value={newStatus}
                onChange={(v) => setNewStatus(v as PP30Row["status"])}
                options={[
                  { value: "draft", label: "ร่าง" },
                  { value: "submitted", label: "ยื่นแล้ว" },
                  { value: "paid", label: "ชำระแล้ว" },
                  { value: "received", label: "รับใบเสร็จแล้ว" },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>วันที่ยื่นแบบ</Label>
              <Input type="date" value={submittedAt} onChange={(e) => setSubmittedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>จำนวนเงินที่ชำระ</Label>
              <Input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>เลขที่อ้างอิงการชำระ</Label>
              <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="เลขที่ชำระเงิน..." />
            </div>
            <div className="space-y-1.5">
              <Label>เลขที่ใบเสร็จ</Label>
              <Input value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} placeholder="เลขที่ใบเสร็จ..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setStatusOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button onClick={handleStatusUpdate} disabled={pending}>
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VatDocTable({ rows, emptyLabel }: { rows: VatDocRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>เลขที่เอกสาร</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>คู่ค้า</TableHead>
            <TableHead className="text-right">ยอดก่อน VAT</TableHead>
            <TableHead className="text-right">VAT</TableHead>
            <TableHead>สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-sm">{r.doc_number ?? "-"}</TableCell>
              <TableCell className="text-sm">
                {r.issue_date
                  ? new Date(r.issue_date).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })
                  : "-"}
              </TableCell>
              <TableCell className="text-sm">{r.contact_name ?? "-"}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {r.sub_total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm font-medium">
                {r.vat_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell>
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                  {r.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HistoryItem({ label, date, done }: { label: string; date: string | null; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("w-2 h-2 rounded-full shrink-0", done ? "bg-teal-500" : "bg-slate-200")} />
      <span className={cn("text-sm flex-1", done ? "text-slate-700" : "text-slate-400")}>{label}</span>
      <span className="text-xs text-slate-400">{date ?? "-"}</span>
    </div>
  );
}

function TimelineItem({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", done ? "bg-teal-500" : "bg-slate-200")} />
      <div>
        <div className={cn("text-sm", done ? "text-slate-700 font-medium" : "text-slate-400")}>{label}</div>
        <div className="text-xs text-slate-400">{value}</div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className={cn("text-slate-800", valueClass)}>{value}</span>
    </div>
  );
}
