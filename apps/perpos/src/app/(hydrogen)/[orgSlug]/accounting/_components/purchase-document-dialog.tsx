"use client";

// purchase-document-dialog.tsx — บันทึกใบกำกับภาษีซื้อที่ได้รับจากผู้ขาย
//   ยอดกรอกตามหน้าบิลจริง (ไม่ให้ระบบคำนวณทับ — บิลอาจปัดเศษต่างจากสูตรเรา)
//   server ตรวจแค่ว่า มูลค่า + VAT = รวม · บันทึกแล้วลงบัญชีอัตโนมัติ

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import cn from "@core/utils/class-names";
import { toast } from "@/lib/toast";
import { useAccountingData } from "./data-provider";
import { fmtMoney, fmtDateTH } from "./format";
import {
  canClaimPurchaseVat,
  type AccPurchaseDocType,
  type AccPurchaseDocument,
} from "@/lib/accounting/types";

const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "tax_invoice", label: "ใบกำกับภาษี" },
  { value: "receipt_tax_invoice", label: "ใบเสร็จรับเงิน/ใบกำกับภาษี" },
  { value: "credit_note", label: "ใบลดหนี้ (จากผู้ขาย)" },
  { value: "debit_note", label: "ใบเพิ่มหนี้ (จากผู้ขาย)" },
  { value: "receipt", label: "ใบเสร็จรับเงิน (เครดิตภาษีซื้อไม่ได้)" },
  { value: "abbreviated_tax_invoice", label: "ใบกำกับภาษีอย่างย่อ (เครดิตไม่ได้)" },
];

const WHT_RATE_OPTIONS = [
  { value: "0", label: "ไม่หัก" },
  { value: "1", label: "1%" },
  { value: "2", label: "2%" },
  { value: "3", label: "3%" },
  { value: "5", label: "5%" },
  { value: "10", label: "10%" },
  { value: "15", label: "15%" },
];

const TH_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

interface DraftLine {
  key: string;
  itemName: string;
  amount: string;
  accountId: string;
}

function emptyLine(): DraftLine {
  return {
    key: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    itemName: "",
    amount: "",
    accountId: "",
  };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PurchaseDocumentCreateDialog({
  open,
  onOpenChange,
  orgId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  onCreated: () => void;
}) {
  const { contacts, accounts, apiSend } = useAccountingData();

  const [docType, setDocType] = useState<AccPurchaseDocType>("tax_invoice");
  const [docNumber, setDocNumber] = useState("");
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()));
  const [taxMonth, setTaxMonth] = useState(String(new Date().getMonth() + 1));
  const [subtotal, setSubtotal] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [whtRate, setWhtRate] = useState("0");
  const [whtForm, setWhtForm] = useState<"pnd53" | "pnd3">("pnd53");
  const [claimable, setClaimable] = useState(true);
  const [nonClaimNote, setNonClaimNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  useEffect(() => {
    if (open === lastOpen) return;
    setLastOpen(open);
    if (open) {
      const d = new Date();
      setDocType("tax_invoice");
      setDocNumber("");
      setContactId("");
      setIssueDate(todayISO());
      setTaxYear(String(d.getFullYear()));
      setTaxMonth(String(d.getMonth() + 1));
      setSubtotal("");
      setVatAmount("");
      setWhtRate("0");
      setWhtForm("pnd53");
      setClaimable(true);
      setNonClaimNote("");
      setLines([emptyLine()]);
      setSaving(false);
    }
  }, [open, lastOpen]);

  // วันที่บนบิลเปลี่ยน → เลื่อนงวดภาษีตามให้ (ผู้ใช้แก้เองได้ ตาม ม.82/3)
  useEffect(() => {
    if (!issueDate) return;
    setTaxYear(issueDate.slice(0, 4));
    setTaxMonth(String(Number(issueDate.slice(5, 7))));
  }, [issueDate]);

  const vendorOptions = useMemo(
    () => [
      { value: "", label: "— เลือกผู้ขาย —" },
      ...contacts
        .filter((c) => c.kind === "vendor" || c.kind === "both")
        .map((c) => ({ value: c.id, label: c.name })),
    ],
    [contacts],
  );

  const accountOptions = useMemo(
    () => [
      { value: "", label: "— เลือกบัญชี —" },
      ...accounts
        .filter((a) => a.is_active && (a.account_type === "expense" || a.account_type === "asset"))
        .map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
    ],
    [accounts],
  );

  const typeAllowsClaim = canClaimPurchaseVat(docType);
  const sub = Number(subtotal) || 0;
  const vat = Number(vatAmount) || 0;
  const total = Math.round((sub + vat) * 100) / 100;
  const whtAmount = Math.round(sub * ((Number(whtRate) || 0) / 100) * 100) / 100;
  const linesSum = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const linesMismatch = lines.some((l) => l.amount) && Math.abs(linesSum - sub) > 0.005;

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function handleSubmit() {
    if (!docNumber.trim()) return toast.error("กรุณากรอกเลขที่ใบกำกับของผู้ขาย");
    if (!contactId) return toast.error("กรุณาเลือกผู้ขาย");
    if (!issueDate) return toast.error("กรุณาเลือกวันที่บนเอกสาร");
    const clean = lines.filter((l) => l.itemName.trim() && Number(l.amount) > 0);
    if (clean.length === 0) return toast.error("กรุณากรอกรายการอย่างน้อย 1 บรรทัด");
    if (clean.some((l) => !l.accountId))
      return toast.error("เลือกบัญชีให้ครบทุกบรรทัด (ใช้ลงบัญชีอัตโนมัติ)");
    if (linesMismatch)
      return toast.error(
        `ยอดรวมบรรทัด (${fmtMoney(linesSum)}) ไม่เท่ามูลค่าสินค้า (${fmtMoney(sub)})`,
      );

    setSaving(true);
    const r = await apiSend("POST", "purchase-documents", {
      orgId,
      doc_type: docType,
      doc_number: docNumber.trim(),
      contact_id: contactId,
      issue_date: issueDate,
      tax_year: Number(taxYear),
      tax_month: Number(taxMonth),
      subtotal: sub,
      vat_amount: vat,
      total,
      wht_rate: Number(whtRate) || 0,
      wht_amount: whtAmount,
      wht_form: whtForm,
      is_vat_claimable: claimable && typeAllowsClaim,
      non_claimable_note: !claimable ? nonClaimNote.trim() || null : null,
      lines: clean.map((l) => ({
        item_name: l.itemName.trim(),
        qty: 1,
        unit_price: Number(l.amount) || 0,
        amount: Number(l.amount) || 0,
        account_id: l.accountId,
      })),
    });
    setSaving(false);
    if (!r.ok) return toast.error(r.error ?? "บันทึกไม่สำเร็จ");
    toast.success(`บันทึกใบกำกับซื้อ ${docNumber.trim()} + ลงบัญชีแล้ว`);
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>บันทึกใบกำกับภาษีซื้อ</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label>ชนิดเอกสาร *</Label>
                <CustomSelect
                  className="mt-1"
                  value={docType}
                  onChange={(v) => setDocType(v as AccPurchaseDocType)}
                  options={DOC_TYPE_OPTIONS}
                />
                {!typeAllowsClaim && (
                  <p className="mt-1 text-xs text-amber-700">
                    เอกสารชนิดนี้เครดิตภาษีซื้อไม่ได้ตามกฎหมาย — บันทึกไว้เป็นค่าใช้จ่ายได้
                    แต่จะไม่เข้า ภ.พ.30
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pd-number">เลขที่ใบกำกับ (ของผู้ขาย) *</Label>
                  <Input
                    id="pd-number"
                    className="mt-1"
                    placeholder="เลขที่ที่พิมพ์บนบิล"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label>ผู้ขาย *</Label>
                  <CustomSelect
                    className="mt-1"
                    value={contactId}
                    onChange={setContactId}
                    options={vendorOptions}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label>วันที่บนเอกสาร *</Label>
                  <ThaiDatePicker
                    value={issueDate}
                    onChange={setIssueDate}
                    placeholder="เลือกวันที่"
                  />
                </div>
                <div>
                  <Label>งวดภาษีที่ใช้ (เดือน)</Label>
                  <CustomSelect
                    className="mt-1"
                    value={taxMonth}
                    onChange={setTaxMonth}
                    options={TH_MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                  />
                </div>
                <div>
                  <Label>งวดภาษี (ปี)</Label>
                  <CustomSelect
                    className="mt-1"
                    value={taxYear}
                    onChange={setTaxYear}
                    options={[0, -1, 1].map((d) => {
                      const y = new Date().getFullYear() + d;
                      return { value: String(y), label: String(y + 543) };
                    })}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-gray-500">
                งวดภาษีตั้งตามวันที่บนบิลให้อัตโนมัติ — เลื่อนไปใช้เดือนหลังได้ (ภายใน 6 เดือน
                ตามมาตรา 82/3)
              </p>

              {/* รายการ + บัญชีปลายทาง */}
              <div>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold text-gray-900">
                    รายการ (เลือกบัญชีเพื่อลงบัญชีอัตโนมัติ)
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLines((p) => [...p, emptyLine()])}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> เพิ่มบรรทัด
                  </Button>
                </div>
                <div className="space-y-2">
                  {lines.map((l, idx) => (
                    <div
                      key={l.key}
                      className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">
                          บรรทัดที่ {idx + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={lines.length <= 1}
                          onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                          aria-label="ลบบรรทัด"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_120px]">
                        <div>
                          <Label>รายละเอียด</Label>
                          <Input
                            className="mt-1"
                            placeholder="เช่น ค่าวัสดุสำนักงาน"
                            value={l.itemName}
                            onChange={(e) => updateLine(l.key, { itemName: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>บัญชี</Label>
                          <CustomSelect
                            className="mt-1"
                            value={l.accountId}
                            onChange={(v) => updateLine(l.key, { accountId: v })}
                            options={accountOptions}
                          />
                        </div>
                        <div>
                          <Label>จำนวนเงิน</Label>
                          <Input
                            type="number"
                            min="0"
                            className="mt-1 text-right"
                            placeholder="0.00"
                            value={l.amount}
                            onChange={(e) => updateLine(l.key, { amount: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {linesMismatch && (
                  <p className="mt-1.5 px-1 text-xs text-red-600">
                    ยอดรวมบรรทัด {fmtMoney(linesSum)} ไม่เท่ามูลค่าสินค้า {fmtMoney(sub)}
                  </p>
                )}
              </div>

              {/* ยอดตามหน้าบิล */}
              <div className="ml-auto w-full max-w-sm space-y-3">
                <div>
                  <Label htmlFor="pd-subtotal">มูลค่าสินค้า/บริการ (ตามบิล) *</Label>
                  <Input
                    id="pd-subtotal"
                    type="number"
                    min="0"
                    className="mt-1 text-right"
                    placeholder="0.00"
                    value={subtotal}
                    onChange={(e) => setSubtotal(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="pd-vat">ภาษีมูลค่าเพิ่ม (ตามบิล)</Label>
                  <Input
                    id="pd-vat"
                    type="number"
                    min="0"
                    className="mt-1 text-right"
                    placeholder="0.00"
                    value={vatAmount}
                    onChange={(e) => setVatAmount(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                  <span className="font-semibold text-gray-900">รวมทั้งสิ้น</span>
                  <span className="font-mono font-semibold tabular-nums text-gray-900">
                    {fmtMoney(total)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Label className="shrink-0">หัก ณ ที่จ่าย</Label>
                  <CustomSelect
                    className="w-28"
                    value={whtRate}
                    onChange={setWhtRate}
                    options={WHT_RATE_OPTIONS}
                  />
                </div>
                {Number(whtRate) > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="shrink-0">แบบที่ยื่น</Label>
                      <SegmentedControl
                        size="sm"
                        value={whtForm}
                        onChange={(v) => setWhtForm(v as "pnd53" | "pnd3")}
                        options={[
                          { value: "pnd53", label: "ภ.ง.ด.53" },
                          { value: "pnd3", label: "ภ.ง.ด.3" },
                        ]}
                        ariaLabel="แบบภาษีหัก ณ ที่จ่าย"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">ยอดหัก ณ ที่จ่าย</span>
                      <span className="font-mono tabular-nums text-red-600">
                        −{fmtMoney(whtAmount)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {typeAllowsClaim && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="shrink-0">เครดิตภาษีซื้อ</Label>
                    <SegmentedControl
                      size="sm"
                      value={claimable ? "yes" : "no"}
                      onChange={(v) => setClaimable(v === "yes")}
                      options={[
                        { value: "yes", label: "เครดิตได้" },
                        { value: "no", label: "ต้องห้าม" },
                      ]}
                      ariaLabel="เครดิตภาษีซื้อ"
                    />
                  </div>
                  {!claimable && (
                    <Input
                      className="mt-2"
                      placeholder="เหตุผล เช่น ค่ารับรอง, รถยนต์นั่ง (มาตรา 82/5)"
                      value={nonClaimNote}
                      onChange={(e) => setNonClaimNote(e.target.value)}
                    />
                  )}
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก + ลงบัญชี"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── รายละเอียดใบกำกับซื้อ (คลิกที่แถวในทะเบียน) ──────────────────────────────
// ดูรายการในบิล + สั่งลงบัญชีซ้ำ (idempotent) + เลื่อนงวดภาษี (ม.82/3 ภายใน 6 เดือน)
// + สลับเครดิตได้/ต้องห้าม (ม.82/5) + ยกเลิก · ลบได้เฉพาะที่ยังไม่ลงบัญชี
export function PurchaseDocumentDetailDialog({
  open,
  onOpenChange,
  doc,
  orgId,
  canWrite,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doc: AccPurchaseDocument | null;
  orgId: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const { apiSend } = useAccountingData();

  const [taxYear, setTaxYear] = useState("");
  const [taxMonth, setTaxMonth] = useState("");
  const [claimable, setClaimable] = useState(true);
  const [nonClaimNote, setNonClaimNote] = useState("");
  const [busy, setBusy] = useState(false);

  const docId = doc?.id ?? "";
  useEffect(() => {
    if (!doc) return;
    setTaxYear(String(doc.tax_year));
    setTaxMonth(String(doc.tax_month));
    setClaimable(doc.is_vat_claimable);
    setNonClaimNote(doc.non_claimable_note ?? "");
    setBusy(false);
    // ผูกกับ id ของเอกสาร ไม่ใช่ object — กัน reset ทับสิ่งที่ผู้ใช้เพิ่งพิมพ์
    // ตอน parent refetch แล้วส่ง object ใหม่ที่เนื้อหาเดิม
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  if (!doc) return null;

  const typeAllowsClaim = canClaimPurchaseVat(doc.doc_type);
  const isVoid = doc.status === "void";
  const dirty =
    Number(taxYear) !== doc.tax_year ||
    Number(taxMonth) !== doc.tax_month ||
    claimable !== doc.is_vat_claimable ||
    (nonClaimNote || "") !== (doc.non_claimable_note ?? "");

  const yearOptions = (() => {
    const y = new Date().getFullYear();
    return [y + 1, y, y - 1, y - 2].map((v) => ({ value: String(v), label: String(v + 543) }));
  })();
  const monthOptions = TH_MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

  async function send(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    const r = await apiSend("PATCH", `purchase-documents/${docId}`, { orgId, ...body });
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "ทำรายการไม่สำเร็จ");
    toast.success(okMsg);
    onChanged();
  }

  async function handleSave() {
    await send(
      {
        tax_year: Number(taxYear),
        tax_month: Number(taxMonth),
        is_vat_claimable: claimable && typeAllowsClaim,
        non_claimable_note: claimable ? null : nonClaimNote.trim() || null,
      },
      "บันทึกแล้ว",
    );
  }

  async function handlePost() {
    setBusy(true);
    const r = await apiSend("PATCH", `purchase-documents/${docId}`, { orgId, action: "post" });
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "ลงบัญชีไม่สำเร็จ");
    toast.success(r.data?.created ? "ลงบัญชีแล้ว" : "เอกสารนี้ลงบัญชีไว้แล้ว");
    onChanged();
  }

  async function handleVoid() {
    await send({ status: "void" }, "ยกเลิกเอกสารแล้ว");
    onOpenChange(false);
  }

  async function handleDelete() {
    setBusy(true);
    const r = await apiSend("DELETE", `purchase-documents/${docId}`);
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "ลบไม่สำเร็จ");
    toast.success("ลบเอกสารแล้ว");
    onChanged();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {DOC_TYPE_OPTIONS.find((o) => o.value === doc.doc_type)?.label ?? "ใบกำกับภาษีซื้อ"}{" "}
            เลขที่ {doc.doc_number}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            {isVoid && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                เอกสารนี้ถูกยกเลิกแล้ว — ไม่ถูกนับใน ภ.พ.30
              </div>
            )}

            {/* หัวเอกสาร */}
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <DetailRow label="ผู้ขาย" value={doc.seller_name ?? doc.contact_name ?? "—"} />
              <DetailRow label="เลขประจำตัวผู้เสียภาษี" value={doc.seller_tax_id ?? "—"} mono />
              <DetailRow label="สาขา" value={doc.seller_branch ?? "—"} />
              <DetailRow label="วันที่บนเอกสาร" value={fmtDateTH(doc.issue_date)} />
              <DetailRow
                label="สมุดรายวัน"
                value={
                  doc.journal_entry_id
                    ? (doc.journal_entry_number ?? "ลงบัญชีแล้ว")
                    : "ยังไม่ลงบัญชี"
                }
              />
              {doc.ocr_job_id && <DetailRow label="ที่มา" value="อ่านจากบิลด้วย AI (OCR)" />}
            </div>

            {/* รายการในบิล */}
            <div>
              <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">รายการในบิล</div>
              <Table className="shadow-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>รายการ</TableHead>
                    <TableHead>บัญชี</TableHead>
                    <TableHead align="right">จำนวนเงิน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(doc.lines ?? []).length === 0 ? (
                    <TableEmpty colSpan={3}>— ไม่มีรายการ —</TableEmpty>
                  ) : (
                    (doc.lines ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.item_name}</TableCell>
                        <TableCell className="text-gray-500">
                          {l.account_code ? `${l.account_code} ${l.account_name ?? ""}` : "—"}
                        </TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(l.amount, { currency: false })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* ยอด */}
            <div className="ml-auto w-full max-w-sm space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">มูลค่าสินค้า/บริการ</span>
                <span className="font-mono tabular-nums text-gray-900">
                  {fmtMoney(doc.subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">ภาษีมูลค่าเพิ่ม</span>
                <span className="font-mono tabular-nums text-gray-900">
                  {fmtMoney(doc.vat_amount)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                <span className="font-semibold text-gray-900">รวมทั้งสิ้น</span>
                <span className="font-mono font-semibold tabular-nums text-gray-900">
                  {fmtMoney(doc.total)}
                </span>
              </div>
              {doc.wht_amount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">
                    หัก ณ ที่จ่าย {doc.wht_rate}% (
                    {doc.wht_form === "pnd3" ? "ภ.ง.ด.3" : "ภ.ง.ด.53"})
                  </span>
                  <span className="font-mono tabular-nums text-red-600">
                    −{fmtMoney(doc.wht_amount)}
                  </span>
                </div>
              )}
            </div>

            {/* งวดภาษี + เครดิตภาษีซื้อ (แก้ได้) */}
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div>
                <Label>งวดภาษีที่นำไปใช้ (ม.82/3 — เลื่อนได้ภายใน 6 เดือน)</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <CustomSelect
                    value={taxMonth}
                    onChange={setTaxMonth}
                    options={monthOptions}
                    disabled={!canWrite || isVoid}
                  />
                  <CustomSelect
                    value={taxYear}
                    onChange={setTaxYear}
                    options={yearOptions}
                    disabled={!canWrite || isVoid}
                  />
                </div>
              </div>

              {typeAllowsClaim ? (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="shrink-0">เครดิตภาษีซื้อ</Label>
                    {canWrite && !isVoid ? (
                      <SegmentedControl
                        size="sm"
                        value={claimable ? "yes" : "no"}
                        onChange={(v) => setClaimable(v === "yes")}
                        options={[
                          { value: "yes", label: "เครดิตได้" },
                          { value: "no", label: "ต้องห้าม" },
                        ]}
                        ariaLabel="เครดิตภาษีซื้อ"
                      />
                    ) : (
                      <span className="text-sm text-gray-900">
                        {claimable ? "เครดิตได้" : "ต้องห้าม"}
                      </span>
                    )}
                  </div>
                  {!claimable && (
                    <Input
                      className="mt-2"
                      placeholder="เหตุผล เช่น ค่ารับรอง, รถยนต์นั่ง (มาตรา 82/5)"
                      value={nonClaimNote}
                      onChange={(e) => setNonClaimNote(e.target.value)}
                      disabled={!canWrite || isVoid}
                    />
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  เอกสารชนิดนี้เครดิตภาษีซื้อไม่ได้ตามกฎหมาย
                </div>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          {canWrite && !isVoid && (
            <>
              {doc.journal_entry_id ? (
                <Button
                  variant="destructive"
                  className="mr-auto"
                  disabled={busy}
                  onClick={handleVoid}
                >
                  ยกเลิกเอกสาร
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  className="mr-auto"
                  disabled={busy}
                  onClick={handleDelete}
                >
                  ลบ
                </Button>
              )}
              {!doc.journal_entry_id && (
                <Button variant="outline" disabled={busy} onClick={handlePost}>
                  ลงบัญชี
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {canWrite && !isVoid && (
            <Button disabled={busy || !dirty} onClick={handleSave}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-1.5">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={cn("text-right text-gray-900", mono && "font-mono tabular-nums")}>
        {value}
      </span>
    </div>
  );
}
