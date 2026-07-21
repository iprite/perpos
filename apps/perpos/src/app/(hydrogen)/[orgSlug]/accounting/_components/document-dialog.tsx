"use client";

// document-dialog.tsx (production) — เอกสารขาย (A3)
//  • DocumentDialog       = รายละเอียด/แก้ไขเอกสารที่มีอยู่ (status/กำหนดชำระ/โน้ต) + convert chain + พรีวิวพิมพ์
//  • DocumentCreateDialog = สร้างเอกสารใหม่ (เลือกชนิด/ลูกค้า/วันที่ + line items typeahead + VAT/WHT + ยอดรวม)
//  ต่างจาก prototype: ตัดปุ่ม/ดialog "ส่งให้ลูกค้าทาง LINE" + FlexPreview ออก (B0 เลื่อนเฟส 2) ·
//    mutator = API จริง (async MutResult) · orgSettings nullable (Non-VAT default) ·
//    ยอดรวม UI = พรีวิว (server recompute เป็น source of truth — G1)
//  consume mutator: addDocument / updateDocument / deleteDocument / convertDocument (data-provider)

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Eye, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { useAccountingData, type ProductInput } from "./data-provider";
import { DocStatusBadge, DOC_TYPE_LABEL } from "./badges";
import { fmtMoney, fmtDateTH } from "./format";
import { DocumentPreview } from "./document-preview";
import { ProductDialog } from "./product-dialog";
import {
  isTaxDocument,
  requiresRefDocument,
  type AccDiscountType,
  type AccDocument,
  type AccDocStatus,
  type AccDocType,
  type AccProduct,
} from "@/lib/accounting/types";

// ── input shapes (call-site contract → ส่งเป็น body ของ mutator addDocument/updateDocument) ──
//   server (computeDocument G1) recompute totals จาก raw lines — UI ส่ง lines ดิบ + flags
//   ใช้ `type` (ไม่ใช่ `interface`) เพื่อให้ assignable กับ Record<string, unknown> ของ mutator body
type DocumentLineBody = {
  item_name: string;
  description: string;
  qty: number;
  unit_price: number;
  discount: number;
  discount_type: AccDiscountType;
  product_id: string | null;
  unit: string | null;
};
type CreateDocumentBody = {
  doc_type: AccDocType;
  contact_id: string;
  issue_date: string;
  due_date: string | null;
  vat_enabled: boolean;
  wht_rate: number;
  note: string | null;
  book_number: string | null;
  ref_document_id: string | null;
  lines: DocumentLineBody[];
};
type UpdateDocumentBody = {
  status: AccDocStatus;
  due_date: string | null;
  note: string | null;
};

const STATUS_OPTIONS: { value: AccDocStatus; label: string }[] = [
  { value: "draft", label: "ฉบับร่าง" },
  { value: "sent", label: "ส่งแล้ว" },
  { value: "accepted", label: "ตอบรับ" },
  { value: "paid", label: "รับชำระแล้ว" },
  { value: "overdue", label: "เกินกำหนด" },
  { value: "void", label: "ยกเลิก" },
];

// chain การแปลงเอกสาร (ต้องตรงกับ NEXT_TYPE ฝั่ง api/accounting/documents/[id]/convert)
// ⚠️ ปลายทางห้ามเป็นใบกำกับภาษี — ใบกำกับของดีลหนึ่งออกได้ใบเดียว (VAT เกิดแล้ว)
//    ขายเชื่อ: ใบกำกับภาษีตอนส่งมอบ → "ใบเสร็จรับเงินธรรมดา" ตอนรับเงิน
const NEXT_TYPE: Partial<Record<AccDocType, AccDocType>> = {
  quotation: "invoice",
  invoice: "receipt",
  tax_invoice: "receipt",
  billing_note: "invoice",
  delivery_note: "invoice",
};

/** วันที่วันนี้ (ISO YYYY-MM-DD, CE) สำหรับ default ของฟอร์มสร้างใหม่ */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// DocumentDialog — รายละเอียด/แก้ไขเอกสารที่มีอยู่
// ─────────────────────────────────────────────────────────────────────────────
export function DocumentDialog({
  open,
  onOpenChange,
  document,
  canWrite,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  document: AccDocument | null;
  canWrite: boolean;
}) {
  const { orgSettings, updateDocument, deleteDocument, convertDocument } = useAccountingData();
  // อัตรา VAT = snapshot ที่แช่แข็งไว้กับใบ (ไม่ใช่ค่าปัจจุบันของกิจการ) — ใบเก่าต้องไม่เปลี่ยนตาม
  const vatRate = document?.vat_rate ?? orgSettings?.vat_rate ?? 7;

  const [status, setStatus] = useState<AccDocStatus>("draft");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const key = `${open}-${document?.id ?? "none"}`;
  const [lastKey, setLastKey] = useState("");
  useEffect(() => {
    if (!open || key === lastKey || !document) return;
    setLastKey(key);
    setSaving(false);
    setStatus(document.status);
    setDueDate(document.due_date ?? "");
    setNote(document.note ?? "");
  }, [open, key, lastKey, document]);

  const nextType = document ? NEXT_TYPE[document.doc_type] : undefined;
  const lines = useMemo(() => document?.lines ?? [], [document]);

  if (!document) return null;

  async function handleSave() {
    if (!document) return;
    const payload: UpdateDocumentBody = {
      status,
      due_date: dueDate || null,
      note: note.trim() || null,
    };
    setSaving(true);
    const result = await updateDocument(document.id, payload);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success(`บันทึก ${document.doc_number} สำเร็จ`);
    onOpenChange(false);
  }

  async function handleConvert() {
    if (!document || !nextType) return;
    setSaving(true);
    const result = await convertDocument(document.id, nextType);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "แปลงเอกสารไม่สำเร็จ");
      return;
    }
    toast.success(
      `แปลง ${document.doc_number} เป็น${DOC_TYPE_LABEL[nextType]}แล้ว — ดูในแท็บ${DOC_TYPE_LABEL[nextType]}`,
    );
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!document) return;
    setSaving(true);
    const result = await deleteDocument(document.id);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "ลบไม่สำเร็จ");
      return;
    }
    toast.success(`ลบ ${document.doc_number} แล้ว`);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>
              <span className="flex flex-wrap items-center gap-2">
                {DOC_TYPE_LABEL[document.doc_type]} · {document.doc_number}
                <DocStatusBadge status={document.status} />
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-5">
              {/* หัวเอกสาร */}
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="ลูกค้า" value={document.buyer_name ?? document.contact_name ?? "—"} />
                <Field label="ออกวันที่" value={fmtDateTH(document.issue_date)} />
                {isTaxDocument(document.doc_type) && (
                  <>
                    <Field
                      label="เลขประจำตัวผู้เสียภาษี (ผู้ซื้อ)"
                      value={document.buyer_tax_id ?? "—"}
                    />
                    <Field label="สาขา (ผู้ซื้อ)" value={document.buyer_branch ?? "—"} />
                    {document.book_number && <Field label="เล่มที่" value={document.book_number} />}
                    {document.ref_doc_number && (
                      <Field label="อ้างถึงใบกำกับภาษี" value={document.ref_doc_number} />
                    )}
                  </>
                )}
              </div>

              {/* แก้ไข: สถานะ + กำหนดชำระ */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>สถานะ</Label>
                  <CustomSelect
                    className="mt-1"
                    value={status}
                    onChange={(v) => setStatus(v as AccDocStatus)}
                    options={STATUS_OPTIONS}
                  />
                </div>
                <div>
                  <Label>กำหนดชำระ</Label>
                  <ThaiDatePicker value={dueDate} onChange={setDueDate} placeholder="ไม่ระบุ" />
                </div>
              </div>

              {/* รายการในเอกสาร */}
              <div>
                <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">รายการ</div>
                <Table className="shadow-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>รายละเอียด</TableHead>
                      <TableHead align="right">จำนวน</TableHead>
                      <TableHead>หน่วย</TableHead>
                      <TableHead align="right">ราคา/หน่วย</TableHead>
                      <TableHead align="right">ส่วนลด</TableHead>
                      <TableHead align="right">รวม</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell wrap>
                          <div className="font-medium text-gray-900">{l.item_name}</div>
                          {l.description && (
                            <div className="mt-0.5 whitespace-pre-line text-xs text-gray-500">
                              {l.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell align="right" className="tabular-nums text-gray-600">
                          {l.qty}
                        </TableCell>
                        <TableCell className="text-gray-600">{l.unit ?? "—"}</TableCell>
                        <TableCell align="right" tabular className="text-gray-600">
                          {fmtMoney(l.unit_price, { currency: false })}
                        </TableCell>
                        <TableCell align="right" className="tabular-nums text-gray-600">
                          {fmtDiscount(l.discount, l.discount_type)}
                        </TableCell>
                        <TableCell align="right" tabular className="text-gray-900">
                          {fmtMoney(l.amount, { currency: false })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* ยอดรวม */}
              <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                <SummaryRow label="ยอดก่อนภาษี" value={fmtMoney(document.subtotal)} />
                {document.vat_amount > 0 && (
                  <SummaryRow
                    label={`ภาษีมูลค่าเพิ่ม ${vatRate}%`}
                    value={fmtMoney(document.vat_amount)}
                  />
                )}
                <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                  <span className="font-semibold text-gray-900">ยอดรวมทั้งสิ้น</span>
                  <span className="font-mono font-semibold tabular-nums text-gray-900">
                    {fmtMoney(document.total)}
                  </span>
                </div>
                {(document.wht_amount ?? 0) > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{`หัก ณ ที่จ่าย ${document.wht_rate ?? 0}%`}</span>
                      <span className="font-mono tabular-nums text-red-600">
                        {`−${fmtMoney(document.wht_amount ?? 0)}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                      <span className="font-semibold text-gray-900">ยอดชำระสุทธิ</span>
                      <span className="font-mono font-semibold tabular-nums text-gray-900">
                        {fmtMoney(document.total - (document.wht_amount ?? 0))}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* โน้ต */}
              <div>
                <Label htmlFor="doc-note">หมายเหตุ</Label>
                <Input
                  id="doc-note"
                  className="mt-1"
                  placeholder="ข้อความเพิ่มเติมในเอกสาร"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={!canWrite}
                />
              </div>

              {/* action: ดูตัวอย่าง (ทุก role) + convert (canWrite) */}
              <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
                  <Eye className="mr-1.5 h-4 w-4" /> ดูตัวอย่าง / พิมพ์
                </Button>
                {canWrite && nextType && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void handleConvert()}
                  >
                    แปลงเป็น{DOC_TYPE_LABEL[nextType]}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            {canWrite && (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                disabled={saving}
                onClick={() => void handleDelete()}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {canWrite ? "ยกเลิก" : "ปิด"}
            </Button>
            {canWrite && (
              <Button disabled={saving} onClick={() => void handleSave()}>
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* พรีวิวเอกสารพร้อมพิมพ์/ดาวน์โหลด PDF */}
      <DocumentPreview open={previewOpen} onOpenChange={setPreviewOpen} document={document} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DocumentCreateDialog — สร้างเอกสารใหม่
// ─────────────────────────────────────────────────────────────────────────────

interface DraftLine {
  key: string;
  productId: string | null; // null = พิมพ์เอง
  itemName: string; // ชื่อสินค้า/บริการ (typeahead)
  description: string; // คำอธิบายรายการ (เพิ่มเติม, อาจว่าง)
  qty: string;
  unit: string; // หน่วยนับ (ม.86/4 (5)) — auto-fill จากสินค้า, แก้เองได้
  unitPrice: string;
  discount: string;
  discountType: AccDiscountType; // 'amount' (฿) | 'percent' (%) default 'amount'
}

function emptyLine(): DraftLine {
  return {
    key: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: null,
    itemName: "",
    description: "",
    qty: "1",
    unit: "",
    unitPrice: "",
    discount: "0",
    discountType: "amount",
  };
}

// ชนิดเอกสาร 9 แบบ (>3 ตัวเลือก → CustomSelect ไม่ใช่ SegmentedControl ตาม DESIGN §7)
const DOC_TYPE_OPTIONS: { value: string; label: string }[] = (
  [
    "quotation",
    "billing_note",
    "invoice",
    "delivery_note",
    "tax_invoice",
    "receipt_tax_invoice",
    "receipt",
    "credit_note",
    "debit_note",
  ] as AccDocType[]
).map((v) => ({ value: v, label: DOC_TYPE_LABEL[v] }));

const DISCOUNT_TYPE_SEG: SegmentedOptionLite<AccDiscountType>[] = [
  { value: "amount", label: "฿" },
  { value: "percent", label: "%" },
];

// อัตราหัก ณ ที่จ่ายไทย (>3 ตัวเลือก → ใช้ CustomSelect ไม่ใช่ pill)
const WHT_RATE_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "1%" },
  { value: "2", label: "2%" },
  { value: "3", label: "3%" },
  { value: "5", label: "5%" },
  { value: "10", label: "10%" },
  { value: "15", label: "15%" },
];

type SegmentedOptionLite<T extends string> = { value: T; label: string };

// amount ต่อบรรทัด (พรีวิว — server recompute เป็นทางการ)
//   percent → max(0, round2(qty*unit_price*(1 − discount/100)))  [clamp discount 0–100]
//   amount  → max(0, qty*unit_price − discount)
function lineAmount(l: {
  qty: string;
  unitPrice: string;
  discount: string;
  discountType: AccDiscountType;
}): number {
  const gross = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
  let net: number;
  if (l.discountType === "percent") {
    const pct = Math.min(100, Math.max(0, Number(l.discount) || 0));
    net = gross * (1 - pct / 100);
  } else {
    net = gross - (Number(l.discount) || 0);
  }
  return Math.round(Math.max(0, net) * 100) / 100;
}

export function DocumentCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { contacts, orgSettings, products, documents, addDocument } = useAccountingData();
  const vatRegistered = orgSettings?.is_vat_registered ?? false;
  const vatRate = orgSettings?.vat_rate ?? 7;

  const [docType, setDocType] = useState<AccDocType>("quotation");
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [bookNumber, setBookNumber] = useState("");
  const [refDocumentId, setRefDocumentId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  // VAT (default = org จด VAT) + WHT หัก ณ ที่จ่าย (default ไม่หัก)
  const [vatEnabled, setVatEnabled] = useState(false);
  const [whtOn, setWhtOn] = useState(false);
  const [whtRate, setWhtRate] = useState("3");

  // typeahead: บรรทัดที่กำลังเปิด popover (key) + dialog เพิ่มสินค้าใหม่ (prefill ชื่อ + บรรทัดที่จะ fill)
  const [openSuggestKey, setOpenSuggestKey] = useState<string | null>(null);
  const [productDialog, setProductDialog] = useState<{ name: string; lineKey: string } | null>(
    null,
  );

  // reset ทุกครั้งที่เปิดใหม่
  const [lastOpen, setLastOpen] = useState(false);
  useEffect(() => {
    if (open === lastOpen) return;
    setLastOpen(open);
    if (open) {
      setDocType("quotation");
      setContactId("");
      setIssueDate(todayISO());
      setDueDate("");
      setNote("");
      setBookNumber("");
      setRefDocumentId("");
      setDraftLines([emptyLine()]);
      setVatEnabled(vatRegistered);
      setWhtOn(false);
      setWhtRate("3");
      setOpenSuggestKey(null);
      setProductDialog(null);
      setSaving(false);
    }
  }, [open, lastOpen, vatRegistered]);

  const contactOptions = useMemo(
    () => [
      { value: "", label: "— เลือกลูกค้า —" },
      ...contacts
        .filter((c) => c.kind === "customer" || c.kind === "both")
        .map((c) => ({ value: c.id, label: c.name })),
    ],
    [contacts],
  );

  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);

  // เอกสารภาษี → ต้องแสดงฟิลด์ ม.86/4 · ใบลด/เพิ่มหนี้ → ต้องอ้างใบกำกับภาษีเดิม
  const isTaxDoc = isTaxDocument(docType);
  const needsRef = requiresRefDocument(docType);

  // ตัวเลือกใบกำกับภาษีเดิมสำหรับใบลดหนี้/ใบเพิ่มหนี้ (กรองตามลูกค้าที่เลือก ถ้าเลือกแล้ว)
  const refDocOptions = useMemo(() => {
    const eligible = documents
      .filter(
        (d) =>
          (d.doc_type === "tax_invoice" || d.doc_type === "receipt_tax_invoice") &&
          d.status !== "void" &&
          (!contactId || d.contact_id === contactId),
      )
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date))
      .slice(0, 100);
    return [
      { value: "", label: "— เลือกใบกำกับภาษีที่อ้างถึง —" },
      ...eligible.map((d) => ({
        value: d.id,
        label: `${d.doc_number} · ${fmtDateTH(d.issue_date)} · ${fmtMoney(d.total)}`,
      })),
    ];
  }, [documents, contactId]);

  const subtotal = useMemo(() => draftLines.reduce((s, l) => s + lineAmount(l), 0), [draftLines]);
  const vatAmount = vatEnabled ? Math.round(subtotal * (vatRate / 100) * 100) / 100 : 0;
  const total = subtotal + vatAmount;
  // WHT คิดจาก subtotal (ฐานก่อน VAT) — มาตรฐานหัก ณ ที่จ่ายไทย
  const whtRateNum = whtOn ? Number(whtRate) || 0 : 0;
  const whtAmount = whtOn ? Math.round(subtotal * (whtRateNum / 100) * 100) / 100 : 0;
  const netPayable = total - whtAmount;

  function updateLine(lineKey: string, patch: Partial<DraftLine>) {
    setDraftLines((prev) => prev.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)));
  }
  // เลือกสินค้าจาก typeahead → auto-fill ชื่อ + ราคา + คำอธิบาย + product_id
  function applyProduct(lineKey: string, p: AccProduct) {
    setDraftLines((prev) =>
      prev.map((l) =>
        l.key === lineKey
          ? {
              ...l,
              productId: p.id,
              itemName: p.name,
              unitPrice: String(p.unit_price),
              unit: p.unit ?? l.unit,
              description: p.description ?? l.description,
            }
          : l,
      ),
    );
    setOpenSuggestKey(null);
  }
  // เพิ่มสินค้าใหม่จาก typeahead สำเร็จ → auto-fill บรรทัดจาก input (product_id ยังว่างจนกว่าจะ refresh)
  function applyNewProduct(lineKey: string, input: ProductInput) {
    setDraftLines((prev) =>
      prev.map((l) =>
        l.key === lineKey
          ? {
              ...l,
              productId: null,
              itemName: input.name,
              unitPrice: String(input.unit_price),
              unit: input.unit ?? l.unit,
              description: input.description ?? l.description,
            }
          : l,
      ),
    );
  }
  // พิมพ์ชื่อสินค้าเอง → ล้าง product_id (free text)
  function typeItemName(lineKey: string, value: string) {
    updateLine(lineKey, { itemName: value, productId: null });
    setOpenSuggestKey(value.trim() ? lineKey : null);
  }
  function addLine() {
    setDraftLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(lineKey: string) {
    setDraftLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== lineKey)));
  }

  async function handleSubmit() {
    if (!contactId) {
      toast.error("กรุณาเลือกลูกค้า");
      return;
    }
    if (!issueDate) {
      toast.error("กรุณาเลือกวันที่ออกเอกสาร");
      return;
    }
    if (needsRef && !refDocumentId) {
      toast.error("กรุณาเลือกใบกำกับภาษีที่อ้างถึง");
      return;
    }
    const cleanLines = draftLines.filter((l) => l.itemName.trim() && Number(l.unitPrice) > 0);
    if (cleanLines.length === 0) {
      toast.error("กรุณากรอกรายการอย่างน้อย 1 บรรทัด (มีชื่อสินค้าและราคา)");
      return;
    }

    const lines: DocumentLineBody[] = cleanLines.map((l) => {
      const qty = Number(l.qty) || 0;
      const unit = Number(l.unitPrice) || 0;
      // clamp: percent 0–100, amount ≥0
      const discount =
        l.discountType === "percent"
          ? Math.min(100, Math.max(0, Number(l.discount) || 0))
          : Math.max(0, Number(l.discount) || 0);
      return {
        item_name: l.itemName.trim(),
        description: l.description.trim(),
        qty,
        unit_price: unit,
        discount,
        discount_type: l.discountType,
        product_id: l.productId,
        unit: l.unit.trim() || null,
      };
    });

    const payload: CreateDocumentBody = {
      doc_type: docType,
      contact_id: contactId,
      issue_date: issueDate,
      due_date: docType === "invoice" ? dueDate || null : null,
      vat_enabled: vatEnabled,
      wht_rate: whtOn ? whtRateNum : 0,
      note: note.trim() || null,
      book_number: isTaxDoc ? bookNumber.trim() || null : null,
      ref_document_id: needsRef ? refDocumentId || null : null,
      lines,
    };

    setSaving(true);
    const result = await addDocument(payload);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "สร้างเอกสารไม่สำเร็จ");
      return;
    }
    toast.success(`สร้าง ${DOC_TYPE_LABEL[docType]} สำเร็จ`);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>สร้างเอกสารใหม่</DialogTitle>
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
                    onChange={(v) => setDocType(v as AccDocType)}
                    options={DOC_TYPE_OPTIONS}
                  />
                  {isTaxDoc && (
                    <p className="mt-1 text-xs text-gray-500">
                      เอกสารภาษี — จะบันทึกชื่อ/ที่อยู่/เลขประจำตัวผู้เสียภาษี/สาขา ของทั้งสองฝ่าย
                      ไว้กับใบนี้ ณ วันที่ออก ตามมาตรา 86/4
                    </p>
                  )}
                </div>

                <div>
                  <Label>ลูกค้า *</Label>
                  <CustomSelect
                    className="mt-1"
                    value={contactId}
                    onChange={setContactId}
                    options={contactOptions}
                  />
                </div>

                {needsRef && (
                  <div>
                    <Label>ใบกำกับภาษีที่อ้างถึง *</Label>
                    <CustomSelect
                      className="mt-1"
                      value={refDocumentId}
                      onChange={setRefDocumentId}
                      options={refDocOptions}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      ใบลดหนี้/ใบเพิ่มหนี้ ต้องอ้างเลขที่และวันที่ของใบกำกับภาษีเดิม (มาตรา 86/10
                      และ 86/9)
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>วันที่ออกเอกสาร *</Label>
                    <ThaiDatePicker
                      value={issueDate}
                      onChange={setIssueDate}
                      placeholder="เลือกวันที่"
                    />
                  </div>
                  {docType === "invoice" && (
                    <div>
                      <Label>กำหนดชำระ</Label>
                      <ThaiDatePicker value={dueDate} onChange={setDueDate} placeholder="ไม่ระบุ" />
                    </div>
                  )}
                  {isTaxDoc && (
                    <div>
                      <Label htmlFor="doc-book-number">เล่มที่</Label>
                      <Input
                        id="doc-book-number"
                        className="mt-1"
                        placeholder="ไม่บังคับ — ใส่เมื่อออกเป็นเล่ม"
                        value={bookNumber}
                        onChange={(e) => setBookNumber(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* line items — card ต่อบรรทัด (อ่านง่าย มือถือไม่ล้น) */}
                <div>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-sm font-semibold text-gray-900">รายการ</span>
                    <Button type="button" variant="outline" size="sm" onClick={addLine}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> เพิ่มบรรทัด
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {draftLines.map((l, idx) => {
                      const amount = lineAmount(l);
                      return (
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
                              onClick={() => removeLine(l.key)}
                              disabled={draftLines.length <= 1}
                              aria-label="ลบบรรทัด"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* ชื่อสินค้า/บริการ — typeahead (พิมพ์ค้นหา + เลือกจากรายการ) */}
                          <ItemNameField
                            line={l}
                            products={activeProducts}
                            open={openSuggestKey === l.key}
                            onType={(v) => typeItemName(l.key, v)}
                            onPick={(p) => applyProduct(l.key, p)}
                            onClose={() => setOpenSuggestKey(null)}
                            onAddNew={(name) => {
                              setOpenSuggestKey(null);
                              setProductDialog({ name, lineKey: l.key });
                            }}
                          />

                          {/* คำอธิบายรายการ (เพิ่มเติม, อาจว่าง) */}
                          <div className="mt-2">
                            <Label>คำอธิบายรายการ</Label>
                            <Textarea
                              className="mt-1"
                              rows={2}
                              placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ) — กด Enter ขึ้นบรรทัดใหม่ได้"
                              value={l.description}
                              onChange={(e) => updateLine(l.key, { description: e.target.value })}
                            />
                          </div>

                          {/* จำนวน · หน่วย · ราคา/หน่วย · ส่วนลด */}
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                            <div>
                              <Label>จำนวน</Label>
                              <Input
                                type="number"
                                min="0"
                                className="mt-1 text-right"
                                value={l.qty}
                                onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>หน่วย</Label>
                              <Input
                                className="mt-1"
                                placeholder="ชิ้น / ชุด / งาน"
                                value={l.unit}
                                onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>ราคา/หน่วย (฿)</Label>
                              <Input
                                type="number"
                                min="0"
                                className="mt-1 text-right"
                                placeholder="0.00"
                                value={l.unitPrice}
                                onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>ส่วนลด</Label>
                              {/* pill ฿/% ฝังในช่อง input ด้านหน้า (leading) */}
                              <div className="mt-1 flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white pl-1 pr-2 ring-offset-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2">
                                <SegmentedControl
                                  size="xs"
                                  value={l.discountType}
                                  onChange={(v) => updateLine(l.key, { discountType: v })}
                                  options={DISCOUNT_TYPE_SEG}
                                  ariaLabel="หน่วยส่วนลด"
                                  className="shrink-0"
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  max={l.discountType === "percent" ? "100" : undefined}
                                  className="h-7 flex-1 border-0 bg-transparent px-0 text-right shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                  placeholder={l.discountType === "percent" ? "0–100" : "0.00"}
                                  value={l.discount}
                                  onChange={(e) => updateLine(l.key, { discount: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>

                          {/* รวมต่อบรรทัด (หลังหักส่วนลด) */}
                          <div className="mt-2 flex items-center justify-end gap-2 border-t border-gray-100 pt-2 text-sm">
                            <span className="text-gray-500">รวม</span>
                            <span className="font-mono font-medium tabular-nums text-gray-900">
                              {fmtMoney(amount, { currency: false })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ภาษี: VAT (เฉพาะ org จด VAT) + หัก ณ ที่จ่าย */}
                <div className="ml-auto w-full max-w-xs space-y-3">
                  {vatRegistered && (
                    <div className="flex items-center justify-between gap-2">
                      <Label className="shrink-0">ภาษีมูลค่าเพิ่ม</Label>
                      <SegmentedControl
                        size="sm"
                        value={vatEnabled ? "vat" : "novat"}
                        onChange={(v) => setVatEnabled(v === "vat")}
                        options={[
                          { value: "vat", label: `มี VAT ${vatRate}%` },
                          { value: "novat", label: "ไม่มี VAT" },
                        ]}
                        ariaLabel="ภาษีมูลค่าเพิ่ม"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <Label className="shrink-0">หัก ณ ที่จ่าย</Label>
                    <SegmentedControl
                      size="sm"
                      value={whtOn ? "wht" : "nowht"}
                      onChange={(v) => setWhtOn(v === "wht")}
                      options={[
                        { value: "wht", label: "หัก ณ ที่จ่าย" },
                        { value: "nowht", label: "ไม่หัก" },
                      ]}
                      ariaLabel="หัก ณ ที่จ่าย"
                    />
                  </div>
                  {whtOn && (
                    <div className="flex items-center justify-between gap-2">
                      <Label className="shrink-0">อัตราหัก ณ ที่จ่าย</Label>
                      <CustomSelect
                        className="w-28"
                        value={whtRate}
                        onChange={setWhtRate}
                        options={WHT_RATE_OPTIONS}
                      />
                    </div>
                  )}
                </div>

                {/* สรุปยอด (พรีวิว) */}
                <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                  <SummaryRow label="ยอดก่อนภาษี" value={fmtMoney(subtotal)} />
                  {vatEnabled && (
                    <SummaryRow label={`ภาษีมูลค่าเพิ่ม ${vatRate}%`} value={fmtMoney(vatAmount)} />
                  )}
                  <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                    <span className="font-semibold text-gray-900">ยอดรวมทั้งสิ้น</span>
                    <span className="font-mono font-semibold tabular-nums text-gray-900">
                      {fmtMoney(total)}
                    </span>
                  </div>
                  {whtOn && whtAmount > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">{`หัก ณ ที่จ่าย ${whtRateNum}%`}</span>
                        <span className="font-mono tabular-nums text-red-600">
                          {`−${fmtMoney(whtAmount)}`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                        <span className="font-semibold text-gray-900">ยอดชำระสุทธิ</span>
                        <span className="font-mono font-semibold tabular-nums text-gray-900">
                          {fmtMoney(netPayable)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <Label htmlFor="doc-create-note">หมายเหตุ</Label>
                  <Input
                    id="doc-create-note"
                    className="mt-1"
                    placeholder="ข้อความเพิ่มเติมในเอกสาร"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังสร้าง…" : "สร้างเอกสาร"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* เพิ่มสินค้าใหม่จาก typeahead (prefill ชื่อ) → onCreated auto-fill บรรทัดนั้น */}
      <ProductDialog
        open={productDialog !== null}
        onOpenChange={(v) => {
          if (!v) setProductDialog(null);
        }}
        product={null}
        canWrite
        defaultName={productDialog?.name}
        onCreated={(input) => {
          if (productDialog) applyNewProduct(productDialog.lineKey, input);
          setProductDialog(null);
        }}
      />
    </>
  );
}

// ── ItemNameField — typeahead ชื่อสินค้า/บริการ (พิมพ์ค้นหา + เลือก/เพิ่มใหม่) ──
function ItemNameField({
  line,
  products,
  open,
  onType,
  onPick,
  onClose,
  onAddNew,
}: {
  line: DraftLine;
  products: AccProduct[];
  open: boolean;
  onType: (value: string) => void;
  onPick: (p: AccProduct) => void;
  onClose: () => void;
  onAddNew: (name: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // ปิด popover เมื่อคลิกนอกบริเวณ
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    }
    window.document.addEventListener("mousedown", onDocClick);
    return () => window.document.removeEventListener("mousedown", onDocClick);
  }, [open, onClose]);

  const q = line.itemName.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [products, q]);
  const showAddNew = q.length > 0 && matches.length === 0;

  return (
    <div ref={wrapRef} className="relative">
      <Label>ชื่อสินค้า/บริการ *</Label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-8"
          placeholder="พิมพ์เพื่อค้นหา หรือพิมพ์ชื่อใหม่"
          value={line.itemName}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => line.itemName.trim() && onType(line.itemName)}
          autoComplete="off"
        />
      </div>

      {open && (matches.length > 0 || showAddNew) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {matches.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="ghost"
              className="flex h-auto w-full items-center justify-between gap-3 rounded-none px-3 py-2 text-left font-normal"
              onClick={() => onPick(p)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>
                {p.code && <span className="block text-xs text-gray-400">{p.code}</span>}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500">
                {fmtMoney(p.unit_price, { currency: false })} ฿ / {p.unit ?? "—"}
              </span>
            </Button>
          ))}
          {showAddNew && (
            <Button
              type="button"
              variant="ghost"
              className="mt-1 flex h-auto w-full items-center justify-start gap-2 rounded-none border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-primary"
              onClick={() => onAddNew(line.itemName.trim())}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">
                เพิ่ม «{line.itemName.trim()}» เข้ารายการสินค้าและบริการ
              </span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// แสดงส่วนลดตาม type: percent → "10%" · amount → "−500" (U+2212) · 0 → "—"
function fmtDiscount(discount: number, type: AccDiscountType): string {
  if (!discount || discount <= 0) return "—";
  if (type === "percent") return `${fmtMoney(discount, { currency: false, decimals: 0 })}%`;
  return `−${fmtMoney(discount, { currency: false })}`;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm text-gray-900">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono tabular-nums text-gray-700">{value}</span>
    </div>
  );
}
