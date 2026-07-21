/* เอกสารพิมพ์ (PRINT DOCUMENT) — ข้อยกเว้น layout ตาม DESIGN (เหมือน wht-pdf/mom-html):
   body เอกสารจัด layout เอง (ตาราง/เส้น/ช่องเซ็น) เพื่อให้พิมพ์ออกมาเหมือนกระดาษจริง.
   ใช้ Tailwind token ล้วน — ไม่มี hex ในไฟล์นี้. รูปโลโก้/ลายเซน = <img> data URL (ต้องอยู่ใน
   #doc-print เพื่อพิมพ์ออกได้ — ImageUpload เป็นตัวอัปโหลดในหน้าตั้งค่า ไม่ใช่ตัวแสดงในเอกสารพิมพ์).
   chrome ของ dialog (Dialog/Button) = @/components/ui ปกติ. ไม่ใช่ violation. */
"use client";

// document-preview.tsx (production) — พรีวิวเอกสารขายแบบไทยพร้อมพิมพ์/ดาวน์โหลด (A3)
// แสดงเอกสาร (หัวบริษัท/ลูกค้า/ตารางรายการ/สรุปยอด/ช่องเซ็น) → พิมพ์เฉพาะตัวเอกสาร (print CSS)
// ดาวน์โหลด PDF = ยิงไป services/pdf-renderer จริง (Phase 1.7) · รองรับต้นฉบับ/สำเนา

import { useMemo, useState } from "react";
import { Printer, Download, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useAccountingData } from "./data-provider";
import { DOC_TYPE_LABEL } from "./badges";
import { fmtMoney, fmtDateTH } from "./format";
// ใช้ตัวเดียวกับที่ใช้สร้าง PDF — เดิม copy ไว้ 2 ที่ ทำให้แก้บั๊กที่เดียวแล้วอีกที่ยังผิด
import { bahtText } from "@/lib/accounting/document-html";
import {
  isTaxDocument,
  type AccDiscountType,
  type AccDocument,
  type AccDocType,
} from "@/lib/accounting/types";

const DOC_TITLE_EN: Record<AccDocType, string> = {
  quotation: "QUOTATION",
  invoice: "INVOICE",
  receipt: "RECEIPT",
  tax_invoice: "TAX INVOICE",
  receipt_tax_invoice: "RECEIPT / TAX INVOICE",
  credit_note: "CREDIT NOTE",
  debit_note: "DEBIT NOTE",
  billing_note: "BILLING NOTE",
  delivery_note: "DELIVERY NOTE",
};

// แสดงส่วนลดตาม type: percent → "10%" · amount → "−500" (U+2212) · 0 → "—"
function fmtDiscount(discount: number, type: AccDiscountType): string {
  if (!discount || discount <= 0) return "—";
  if (type === "percent") return `${fmtMoney(discount, { currency: false, decimals: 0 })}%`;
  return `−${fmtMoney(discount, { currency: false })}`;
}

export function DocumentPreview({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  document: AccDocument | null;
}) {
  const { orgSettings, contacts, apiGetBlob } = useAccountingData();
  const [downloading, setDownloading] = useState(false);
  // อัตรา VAT = snapshot ของใบนี้ (ม.86/4 (6)) — ไม่ใช่ค่าปัจจุบันของกิจการ
  const vatRate = document?.vat_rate ?? orgSettings?.vat_rate ?? 7;

  // fallback สำหรับใบเก่าที่ออกก่อนมี snapshot เท่านั้น — ใบใหม่ใช้ค่าที่แช่แข็งไว้กับเอกสาร
  const contact = useMemo(
    () => (document?.contact_id ? contacts.find((c) => c.id === document.contact_id) : undefined),
    [contacts, document],
  );
  const lines = document?.lines ?? [];

  if (!document) return null;

  const isTaxDoc = isTaxDocument(document.doc_type);
  // ม.86/4 — ทุกค่าอ่านจาก snapshot ของเอกสารก่อนเสมอ
  const sellerName = document.seller_name ?? orgSettings?.org_name?.trim() ?? "—";
  const sellerAddress = document.seller_address ?? orgSettings?.address ?? "—";
  const sellerTaxId = document.seller_tax_id ?? orgSettings?.tax_id ?? "—";
  const sellerBranch = document.seller_branch ?? orgSettings?.branch ?? "—";
  const buyerName = document.buyer_name ?? document.contact_name ?? contact?.name ?? "—";
  const buyerAddress = document.buyer_address ?? contact?.address ?? null;
  const buyerTaxId = document.buyer_tax_id ?? contact?.tax_id ?? null;
  const buyerBranch = document.buyer_branch ?? contact?.branch ?? null;

  // หัก ณ ที่จ่าย: ยอดชำระสุทธิ = total − wht_amount
  const whtAmount = document.wht_amount ?? 0;
  const netPayable = document.total - whtAmount;

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  /** ดาวน์โหลด PDF จริงจาก services/pdf-renderer (Phase 1.7) · copy = สำเนา */
  async function handleDownload(copy = false) {
    if (!document || downloading) return;
    setDownloading(true);
    try {
      const path = `documents/${document.id}/pdf${copy ? "?copy=1" : ""}`;
      const blob = await apiGetBlob(path);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${document.doc_number}${copy ? "-copy" : ""}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`ดาวน์โหลด ${document.doc_number}${copy ? " (สำเนา)" : ""} แล้ว`);
    } catch (e) {
      toast.error((e as Error).message || "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="3xl">
        {/* print CSS — พิมพ์เฉพาะ #doc-print ซ่อนทุกอย่างอื่น + ปุ่ม (data-no-print) */}
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #doc-print, #doc-print * { visibility: visible !important; }
            #doc-print { position: absolute; inset: 0; margin: 0; padding: 24px; box-shadow: none !important; }
            [data-no-print] { display: none !important; }
          }
        `}</style>
        <DialogHeader>
          <DialogTitle>ตัวอย่างเอกสาร — {document.doc_number}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {/* ===== ตัวเอกสาร (กระดาษ A4 จำลอง) ===== */}
          <div
            id="doc-print"
            className="mx-auto max-w-[800px] rounded-lg border border-gray-300 bg-white p-8 text-sm text-gray-900 shadow-sm"
          >
            {/* หัวกระดาษ: บริษัท + ชื่อเอกสาร */}
            <div className="flex items-start justify-between gap-4 border-b border-gray-300 pb-5">
              <div className="flex gap-3">
                {orgSettings?.logo_data_url ? (
                  // เอกสารพิมพ์: ใช้ <img> data URL จากตั้งค่า (อยู่ใน #doc-print เพื่อพิมพ์ออกได้)
                  <img
                    src={orgSettings.logo_data_url}
                    alt="โลโก้"
                    className="h-16 w-16 shrink-0 object-contain"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-gray-300 text-[10px] text-gray-400">
                    โลโก้
                  </div>
                )}
                <div>
                  <div className="text-base font-bold text-gray-900">{sellerName}</div>
                  <div className="mt-1 max-w-xs text-xs leading-relaxed text-gray-600">
                    {sellerAddress}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-600">
                    เลขประจำตัวผู้เสียภาษี: {sellerTaxId}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-600">สาขา: {sellerBranch}</div>
                </div>
              </div>
              <div className="text-right">
                {/* ม.86/4 (1) ต้องมีคำว่า "ใบกำกับภาษี" ในที่ที่เห็นได้เด่นชัด */}
                <div className="text-lg font-bold text-gray-900">
                  {DOC_TYPE_LABEL[document.doc_type]}
                </div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {DOC_TITLE_EN[document.doc_type]}
                </div>
                {isTaxDoc && (
                  <div className="mt-1 inline-block rounded border border-gray-400 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                    ต้นฉบับ / ORIGINAL
                  </div>
                )}
              </div>
            </div>

            {/* meta: เลขเอกสาร / วันที่ */}
            <div className="mt-4 flex flex-wrap justify-between gap-4">
              {/* กล่องผู้ซื้อ — ม.86/4 (3) ชื่อ + ที่อยู่ (+ เลขผู้เสียภาษี/สาขา ตามประกาศอธิบดีฯ) */}
              <div className="min-w-[240px]">
                <div className="text-xs font-semibold text-gray-500">
                  {isTaxDoc ? "ผู้ซื้อ" : "ลูกค้า"}
                </div>
                <div className="mt-1 font-medium text-gray-900">{buyerName}</div>
                {buyerAddress && (
                  <div className="mt-0.5 max-w-xs text-xs leading-relaxed text-gray-600">
                    {buyerAddress}
                  </div>
                )}
                {buyerTaxId && (
                  <div className="mt-0.5 text-xs text-gray-600">
                    เลขประจำตัวผู้เสียภาษี: {buyerTaxId}
                  </div>
                )}
                {buyerBranch && (
                  <div className="mt-0.5 text-xs text-gray-600">สาขา: {buyerBranch}</div>
                )}
              </div>

              {/* meta ขวา — ม.86/4 (4) เลขที่ + เล่มที่ · (7) วันเดือนปีที่ออก */}
              <div className="text-sm">
                <MetaRow label="เลขที่เอกสาร" value={document.doc_number} mono />
                {document.book_number && (
                  <MetaRow label="เล่มที่" value={document.book_number} mono />
                )}
                <MetaRow label="วันที่ออก" value={fmtDateTH(document.issue_date)} />
                {document.doc_type === "invoice" && document.due_date && (
                  <MetaRow label="กำหนดชำระ" value={fmtDateTH(document.due_date)} />
                )}
                {document.ref_doc_number && (
                  <MetaRow label="อ้างถึงใบกำกับภาษีเลขที่" value={document.ref_doc_number} mono />
                )}
              </div>
            </div>

            {/* ตารางรายการ (เอกสารพิมพ์ — ตารางจัดเอง ไม่ใช้ Table primitive) */}
            <div className="mt-5 overflow-hidden rounded border border-gray-300">
              <div className="grid grid-cols-[32px_1fr_54px_64px_92px_88px_104px] bg-gray-100 text-xs font-semibold text-gray-600">
                <div className="px-2 py-2 text-center">#</div>
                <div className="px-2 py-2">รายละเอียด</div>
                <div className="px-2 py-2 text-right">จำนวน</div>
                <div className="px-2 py-2">หน่วย</div>
                <div className="px-2 py-2 text-right">ราคา/หน่วย</div>
                <div className="px-2 py-2 text-right">ส่วนลด</div>
                <div className="px-2 py-2 text-right">จำนวนเงิน</div>
              </div>
              {lines.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-gray-400">— ไม่มีรายการ —</div>
              ) : (
                lines.map((l, i) => (
                  <div
                    key={l.id}
                    className="grid grid-cols-[32px_1fr_54px_64px_92px_88px_104px] border-t border-gray-200 text-sm"
                  >
                    <div className="px-2 py-2 text-center text-gray-500">{i + 1}</div>
                    <div className="px-2 py-2">
                      <div className="font-medium text-gray-900">{l.item_name}</div>
                      {l.description && (
                        <div className="mt-0.5 whitespace-pre-line text-xs text-gray-500">
                          {l.description}
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-2 text-right tabular-nums text-gray-600">{l.qty}</div>
                    <div className="px-2 py-2 text-gray-600">{l.unit ?? "—"}</div>
                    <div className="px-2 py-2 text-right font-mono tabular-nums text-gray-600">
                      {fmtMoney(l.unit_price, { currency: false })}
                    </div>
                    <div className="px-2 py-2 text-right tabular-nums text-gray-600">
                      {fmtDiscount(l.discount, l.discount_type)}
                    </div>
                    <div className="px-2 py-2 text-right font-mono tabular-nums text-gray-900">
                      {fmtMoney(l.amount, { currency: false })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* สรุปยอด */}
            <div className="mt-4 flex flex-col items-end gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <span className="font-semibold text-gray-700">จำนวนเงิน (ตัวอักษร): </span>
                {bahtText(netPayable)}
              </div>
              <div className="w-full max-w-[260px] space-y-1.5 text-sm">
                <SummaryRow label="มูลค่าสินค้า/บริการ" value={fmtMoney(document.subtotal)} />
                {/* ม.86/4 (6) — จำนวน VAT ต้องแยกออกจากมูลค่าสินค้าชัดเจน (แสดงแม้เป็น 0) */}
                {(isTaxDoc || document.vat_amount > 0) && (
                  <SummaryRow
                    label={`ภาษีมูลค่าเพิ่ม ${vatRate}%`}
                    value={fmtMoney(document.vat_amount)}
                  />
                )}
                <div className="flex items-center justify-between border-t-2 border-gray-300 pt-1.5">
                  <span className="font-bold text-gray-900">ยอดรวมทั้งสิ้น</span>
                  <span className="font-mono text-base font-bold tabular-nums text-gray-900">
                    {fmtMoney(document.total)}
                  </span>
                </div>
                {whtAmount > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{`หัก ณ ที่จ่าย ${document.wht_rate ?? 0}%`}</span>
                      <span className="font-mono tabular-nums text-red-600">
                        {`−${fmtMoney(whtAmount)}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-300 pt-1.5">
                      <span className="font-bold text-gray-900">ยอดชำระสุทธิ</span>
                      <span className="font-mono text-base font-bold tabular-nums text-gray-900">
                        {fmtMoney(netPayable)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* หมายเหตุ */}
            {document.note && (
              <div className="mt-4 text-xs text-gray-600">
                <span className="font-semibold text-gray-700">หมายเหตุ: </span>
                {document.note}
              </div>
            )}

            {/* ช่องเซ็น — ผู้มีอำนาจลงนามแสดงลายเซนที่อัปโหลดในตั้งค่า (ถ้ามี) */}
            <div className="mt-10 grid grid-cols-2 gap-8">
              <SignBox label="ผู้รับเงิน / ผู้รับเอกสาร" />
              <SignBox label="ผู้มีอำนาจลงนาม" signatureUrl={orgSettings?.signature_data_url} />
            </div>
          </div>
        </DialogBody>
        <DialogFooter data-no-print>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {isTaxDoc && (
            <Button
              variant="outline"
              disabled={downloading}
              onClick={() => void handleDownload(true)}
            >
              <Copy className="mr-1.5 h-4 w-4" /> สำเนา (PDF)
            </Button>
          )}
          <Button
            variant="outline"
            disabled={downloading}
            onClick={() => void handleDownload(false)}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {downloading ? "กำลังสร้าง…" : isTaxDoc ? "ต้นฉบับ (PDF)" : "ดาวน์โหลด PDF"}
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" /> พิมพ์
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-end gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={mono ? "font-mono tabular-nums text-gray-900" : "text-gray-900"}>
        {value}
      </span>
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

function SignBox({ label, signatureUrl }: { label: string; signatureUrl?: string | null }) {
  return (
    <div className="text-center">
      {signatureUrl ? (
        // เอกสารพิมพ์: รูปลายเซน data URL จากตั้งค่า (อยู่ใน #doc-print เพื่อพิมพ์ออกได้)
        <img src={signatureUrl} alt="ลายเซน" className="mx-auto mb-1 h-12 object-contain" />
      ) : (
        <div className="mt-8" />
      )}
      <div className="border-t border-gray-400 pt-1.5 text-xs text-gray-600">{label}</div>
      <div className="mt-1 text-[10px] text-gray-400">วันที่ ......./......./.......</div>
    </div>
  );
}
