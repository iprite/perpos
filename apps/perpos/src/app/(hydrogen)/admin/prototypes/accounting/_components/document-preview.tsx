/* เอกสารพิมพ์ (PRINT DOCUMENT) — ข้อยกเว้น layout ตาม DESIGN (เหมือน wht-pdf/mom-html/flex-preview):
   body เอกสารจัด layout เอง (ตาราง/เส้น/ช่องเซ็น) เพื่อให้พิมพ์ออกมาเหมือนกระดาษจริง.
   พยายามใช้ Tailwind token ก่อน — ไม่มี hex ในไฟล์นี้ (ใช้ utility class ล้วน).
   chrome ของ dialog (Dialog/Button) = @/components/ui ปกติ. ไม่ใช่ violation. */
"use client";

// document-preview.tsx — พรีวิวเอกสารขายแบบไทยพร้อมพิมพ์/ดาวน์โหลด (A3)
// แสดงเอกสาร (หัวบริษัท/ลูกค้า/ตารางรายการ/สรุปยอด/ช่องเซ็น) → พิมพ์เฉพาะตัวเอกสาร (print CSS)
// prototype: ดาวน์โหลด PDF = toast จำลอง · production = ต่อ pdf-renderer (services/pdf-renderer)

import { useMemo } from "react";
import { Printer, Download } from "lucide-react";
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
import { useAccountingData } from "./data-context";
import { DOC_TYPE_LABEL } from "./badges";
import { fmtMoney, fmtDateTH } from "./format";
import type { AccDiscountType, AccDocument, AccDocType } from "../_fixtures/types";

const DOC_TITLE_EN: Record<AccDocType, string> = {
  quotation: "QUOTATION",
  invoice: "INVOICE",
  receipt: "RECEIPT",
};

// แสดงส่วนลดตาม type: percent → "10%" · amount → "−500" (U+2212) · 0 → "—"
function fmtDiscount(discount: number, type: AccDiscountType): string {
  if (!discount || discount <= 0) return "—";
  if (type === "percent") return `${fmtMoney(discount, { currency: false, decimals: 0 })}%`;
  return `−${fmtMoney(discount, { currency: false })}`;
}

// ── จำนวนเงินเป็นตัวอักษรไทย (บาท/สตางค์) ───────────────────────────────────
const TH_NUM = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const TH_POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function readThaiInteger(numStr: string): string {
  const n = numStr.replace(/^0+/, "");
  if (n === "" || n === "0") return "ศูนย์";
  let result = "";
  const len = n.length;
  for (let i = 0; i < len; i++) {
    const digit = Number(n[i]);
    const pos = (len - i - 1) % 6;
    const isMillionBoundary = len - i - 1 === 6 || len - i - 1 === 12;
    if (digit !== 0) {
      let d = TH_NUM[digit];
      if (pos === 1 && digit === 1)
        d = ""; // สิบ
      else if (pos === 1 && digit === 2) d = "ยี่"; // ยี่สิบ
      if (pos === 0 && digit === 1 && len > 1 && (len - i) % 6 !== 1) d = "เอ็ด";
      result += d + TH_POS[pos];
    }
    if (isMillionBoundary) result += "ล้าน";
  }
  return result;
}

function bahtText(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);
  const bahtPart = readThaiInteger(String(baht)) + "บาท";
  if (satang === 0) return bahtPart + "ถ้วน";
  return bahtPart + readThaiInteger(String(satang)) + "สตางค์";
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
  const { orgSettings, contacts } = useAccountingData();

  const contact = useMemo(
    () => (document?.contact_id ? contacts.find((c) => c.id === document.contact_id) : undefined),
    [contacts, document],
  );
  const lines = document?.lines ?? [];

  if (!document) return null;

  // หัก ณ ที่จ่าย: ยอดชำระสุทธิ = total − wht_amount
  const whtAmount = document.wht_amount ?? 0;
  const netPayable = document.total - whtAmount;

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  function handleDownload() {
    // prototype: จำลอง — production = ยิงไป services/pdf-renderer สร้าง PDF จริง
    toast.success("กำลังสร้าง PDF… (จำลอง)");
  }

  // ชื่อบริษัทบนเอกสาร — ใช้ org_name ที่ตั้งค่าไว้ ถ้าไม่มีใช้ placeholder
  const orgName = orgSettings.org_name?.trim() || "บริษัท ตัวอย่าง จำกัด";

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
                {orgSettings.logo_data_url ? (
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
                  <div className="text-base font-bold text-gray-900">{orgName}</div>
                  <div className="mt-1 max-w-xs text-xs leading-relaxed text-gray-600">
                    {orgSettings.address ?? "—"}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-600">
                    เลขประจำตัวผู้เสียภาษี: {orgSettings.tax_id ?? "—"}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900">
                  {DOC_TYPE_LABEL[document.doc_type]}
                </div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {DOC_TITLE_EN[document.doc_type]}
                </div>
              </div>
            </div>

            {/* meta: เลขเอกสาร / วันที่ */}
            <div className="mt-4 flex flex-wrap justify-between gap-4">
              {/* กล่องลูกค้า */}
              <div className="min-w-[240px]">
                <div className="text-xs font-semibold text-gray-500">ลูกค้า</div>
                <div className="mt-1 font-medium text-gray-900">
                  {document.contact_name ?? contact?.name ?? "—"}
                </div>
                {contact?.address && (
                  <div className="mt-0.5 max-w-xs text-xs leading-relaxed text-gray-600">
                    {contact.address}
                  </div>
                )}
                {contact?.tax_id && (
                  <div className="mt-0.5 text-xs text-gray-600">
                    เลขผู้เสียภาษี: {contact.tax_id}
                  </div>
                )}
              </div>

              {/* meta ขวา */}
              <div className="text-sm">
                <MetaRow label="เลขที่เอกสาร" value={document.doc_number} mono />
                <MetaRow label="วันที่ออก" value={fmtDateTH(document.issue_date)} />
                {document.doc_type === "invoice" && document.due_date && (
                  <MetaRow label="กำหนดชำระ" value={fmtDateTH(document.due_date)} />
                )}
              </div>
            </div>

            {/* ตารางรายการ (เอกสารพิมพ์ — ตารางจัดเอง ไม่ใช้ Table primitive) */}
            <div className="mt-5 overflow-hidden rounded border border-gray-300">
              <div className="grid grid-cols-[36px_1fr_60px_100px_100px_110px] bg-gray-100 text-xs font-semibold text-gray-600">
                <div className="px-2 py-2 text-center">#</div>
                <div className="px-2 py-2">รายละเอียด</div>
                <div className="px-2 py-2 text-right">จำนวน</div>
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
                    className="grid grid-cols-[36px_1fr_60px_100px_100px_110px] border-t border-gray-200 text-sm"
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
                <SummaryRow label="ยอดก่อนภาษี" value={fmtMoney(document.subtotal)} />
                {document.vat_amount > 0 && (
                  <SummaryRow
                    label={`ภาษีมูลค่าเพิ่ม ${orgSettings.vat_rate}%`}
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
              <SignBox label="ผู้มีอำนาจลงนาม" signatureUrl={orgSettings.signature_data_url} />
            </div>
          </div>
        </DialogBody>
        <DialogFooter data-no-print>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="mr-1.5 h-4 w-4" /> ดาวน์โหลด PDF
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
