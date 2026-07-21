/**
 * document-html.ts — สร้าง HTML ของเอกสารขายสำหรับส่งเข้า services/pdf-renderer (Phase 1.7)
 *
 * ต้องพิมพ์ครบตาม ม.86/4 เหมือนหน้าพรีวิวบนเว็บเป๊ะ:
 *   คำว่า "ใบกำกับภาษี" · ต้นฉบับ/สำเนา · ผู้ขาย (ชื่อ/ที่อยู่/เลขผู้เสียภาษี/สาขา)
 *   · ผู้ซื้อครบชุด · เลขที่ + เล่มที่ · ชื่อ/ปริมาณ/หน่วย/มูลค่า · VAT แยกบรรทัด · วันที่ออก
 *
 * ทุกค่าอ่านจาก snapshot ของเอกสาร (คอลัมน์ seller_ / buyer_) — ห้าม join สด
 * เอกสารภาษีที่ออกไปแล้วต้องพิมพ์ได้เหมือนเดิมตลอดกาล แม้ข้อมูล master เปลี่ยน
 *
 * ⚠️ ต้อง escape ทุกค่าที่มาจากผู้ใช้ — ชื่อลูกค้า/โน้ต ที่มี < > & จะทำ HTML พัง
 *    (และเป็นช่องฉีด HTML เข้าไปในไฟล์ที่ถูกส่งต่อให้คู่ค้า)
 */
import type { AccDocument, AccDocumentLine } from "./types";
import { isTaxDocument } from "./types";

const DOC_TYPE_LABEL: Record<string, string> = {
  quotation: "ใบเสนอราคา",
  invoice: "ใบแจ้งหนี้",
  receipt: "ใบเสร็จรับเงิน",
  tax_invoice: "ใบกำกับภาษี",
  receipt_tax_invoice: "ใบเสร็จรับเงิน/ใบกำกับภาษี",
  credit_note: "ใบลดหนี้",
  debit_note: "ใบเพิ่มหนี้",
  billing_note: "ใบวางบิล",
  delivery_note: "ใบส่งของ",
};

const DOC_TITLE_EN: Record<string, string> = {
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

/** escape สำหรับแทรกใน text node / attribute */
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n: unknown, decimals = 2): string {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(v));
}

/** วันที่ไทย พ.ศ. (เอกสารต้องแสดง พ.ศ.) */
function fmtDateTH(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const months = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// ── จำนวนเงินเป็นตัวอักษรไทย ────────────────────────────────────────────────
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
      if (pos === 1 && digit === 1) d = "";
      else if (pos === 1 && digit === 2) d = "ยี่";
      // หลักหน่วยของกลุ่ม 6 หลัก อ่าน "เอ็ด" เมื่อมีหลักสูงกว่าที่ไม่ใช่ 0 อยู่ในกลุ่มเดียวกัน
      // (21 = ยี่สิบเอ็ด · 11 = สิบเอ็ด · 101 = หนึ่งร้อยเอ็ด · แต่ 1 = หนึ่ง)
      if (pos === 0 && digit === 1) {
        const groupIdx = Math.floor((len - i - 1) / 6);
        let hasHigherInGroup = false;
        for (let k = 0; k < i; k++) {
          if (Math.floor((len - k - 1) / 6) === groupIdx && Number(n[k]) !== 0) {
            hasHigherInGroup = true;
            break;
          }
        }
        if (hasHigherInGroup) d = "เอ็ด";
      }
      result += d + TH_POS[pos];
    }
    if (isMillionBoundary) result += "ล้าน";
  }
  return result;
}

export function bahtText(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);
  const bahtPart = readThaiInteger(String(baht)) + "บาท";
  if (satang === 0) return bahtPart + "ถ้วน";
  return bahtPart + readThaiInteger(String(satang)) + "สตางค์";
}

export interface DocumentHtmlOptions {
  /** สำเนา — ใบกำกับภาษีต้องระบุว่าเป็นต้นฉบับหรือสำเนา */
  copy?: boolean;
  orgSettings?: { logo_data_url?: string | null; signature_data_url?: string | null } | null;
}

/** สร้าง HTML เอกสารขาย 1 ใบ (A4) พร้อมส่งเข้า pdf-renderer */
export function buildDocumentHtml(
  doc: AccDocument,
  lines: AccDocumentLine[],
  opts: DocumentHtmlOptions = {},
): string {
  const isTax = isTaxDocument(doc.doc_type);
  const label = DOC_TYPE_LABEL[doc.doc_type] ?? "เอกสาร";
  const labelEn = DOC_TITLE_EN[doc.doc_type] ?? "DOCUMENT";
  const vatRate = doc.vat_rate ?? 7;
  const whtAmount = Number(doc.wht_amount) || 0;
  const netPayable = (Number(doc.total) || 0) - whtAmount;

  const logo = opts.orgSettings?.logo_data_url;
  const signature = opts.orgSettings?.signature_data_url;

  const lineRows =
    lines.length === 0
      ? `<tr><td colspan="7" class="empty">— ไม่มีรายการ —</td></tr>`
      : lines
          .map(
            (l, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(l.item_name)}${
        l.description ? `<div class="sub">${esc(l.description)}</div>` : ""
      }</td>
      <td class="r">${fmt(l.qty, 2)}</td>
      <td>${esc(l.unit ?? "—")}</td>
      <td class="r">${fmt(l.unit_price)}</td>
      <td class="r">${
        Number(l.discount) > 0
          ? l.discount_type === "percent"
            ? `${fmt(l.discount, 0)}%`
            : `−${fmt(l.discount)}`
          : "—"
      }</td>
      <td class="r">${fmt(l.amount)}</td>
    </tr>`,
          )
          .join("");

  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 12mm 12mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Thai', sans-serif; color: #1a1a1b; font-size: 11px; line-height: 1.5; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          border-bottom: 1px solid #ccd1d9; padding-bottom: 12px; }
  .seller { display: flex; gap: 10px; }
  .logo { width: 56px; height: 56px; object-fit: contain; flex: 0 0 auto; }
  .logo-ph { width: 56px; height: 56px; border: 1px dashed #ccd1d9; border-radius: 4px;
             display: flex; align-items: center; justify-content: center; font-size: 8px; color: #9ca3af; }
  .org { font-size: 13px; font-weight: 700; }
  .muted { color: #656d78; font-size: 10px; }
  .title { font-size: 17px; font-weight: 700; text-align: right; }
  .title-en { font-size: 9px; letter-spacing: 1px; color: #656d78; text-align: right; text-transform: uppercase; }
  .stamp { display: inline-block; margin-top: 4px; border: 1px solid #656d78; border-radius: 3px;
           padding: 1px 6px; font-size: 8px; font-weight: 600; color: #3c3b3d; }
  .meta { display: flex; justify-content: space-between; gap: 16px; margin-top: 12px; }
  .party-label { font-size: 10px; font-weight: 600; color: #656d78; }
  .party-name { font-weight: 600; margin-top: 2px; }
  .metarow { display: flex; justify-content: flex-end; gap: 10px; }
  .metarow span:first-child { color: #656d78; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 10.5px; }
  th { background: #f5f7fa; border: 1px solid #ccd1d9; padding: 5px 6px; font-weight: 600;
       font-size: 10px; color: #3c3b3d; text-align: left; }
  td { border: 1px solid #e6e9ee; padding: 5px 6px; vertical-align: top; }
  td.r, th.r { text-align: right; }
  td.c, th.c { text-align: center; }
  .sub { color: #656d78; font-size: 9.5px; margin-top: 1px; white-space: pre-line; }
  .empty { text-align: center; color: #9ca3af; padding: 14px; }
  .foot { display: flex; justify-content: space-between; gap: 16px; margin-top: 12px; }
  .baht { border: 1px solid #e6e9ee; background: #f5f7fa; border-radius: 4px; padding: 6px 8px;
          font-size: 10px; align-self: flex-start; max-width: 62%; }
  .sums { width: 250px; flex: 0 0 auto; }
  .sumrow { display: flex; justify-content: space-between; padding: 2px 0; }
  .sumrow.total { border-top: 2px solid #ccd1d9; margin-top: 4px; padding-top: 5px; font-weight: 700; font-size: 12px; }
  .sumrow.net { border-top: 1px solid #ccd1d9; margin-top: 3px; padding-top: 4px; font-weight: 700; }
  .neg { color: #d8334a; }
  .signs { display: flex; gap: 40px; margin-top: 36px; }
  .sign { flex: 1; text-align: center; }
  .sign img { height: 42px; object-fit: contain; margin-bottom: 2px; }
  .sign .line { border-top: 1px solid #656d78; padding-top: 4px; font-size: 10px; color: #656d78; }
  .sign .date { font-size: 8.5px; color: #9ca3af; margin-top: 2px; }
  .note { margin-top: 10px; font-size: 10px; color: #656d78; }
</style></head><body>

<div class="head">
  <div class="seller">
    ${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : `<div class="logo-ph">โลโก้</div>`}
    <div>
      <div class="org">${esc(doc.seller_name ?? "—")}</div>
      <div class="muted">${esc(doc.seller_address ?? "—")}</div>
      <div class="muted">เลขประจำตัวผู้เสียภาษี: ${esc(doc.seller_tax_id ?? "—")}</div>
      <div class="muted">สาขา: ${esc(doc.seller_branch ?? "—")}</div>
    </div>
  </div>
  <div>
    <div class="title">${esc(label)}</div>
    <div class="title-en">${esc(labelEn)}</div>
    ${isTax ? `<div style="text-align:right"><span class="stamp">${opts.copy ? "สำเนา / COPY" : "ต้นฉบับ / ORIGINAL"}</span></div>` : ""}
  </div>
</div>

<div class="meta">
  <div>
    <div class="party-label">${isTax ? "ผู้ซื้อ" : "ลูกค้า"}</div>
    <div class="party-name">${esc(doc.buyer_name ?? doc.contact_name ?? "—")}</div>
    ${doc.buyer_address ? `<div class="muted">${esc(doc.buyer_address)}</div>` : ""}
    ${doc.buyer_tax_id ? `<div class="muted">เลขประจำตัวผู้เสียภาษี: ${esc(doc.buyer_tax_id)}</div>` : ""}
    ${doc.buyer_branch ? `<div class="muted">สาขา: ${esc(doc.buyer_branch)}</div>` : ""}
  </div>
  <div style="font-size:10.5px">
    <div class="metarow"><span>เลขที่เอกสาร</span><span><b>${esc(doc.doc_number)}</b></span></div>
    ${doc.book_number ? `<div class="metarow"><span>เล่มที่</span><span>${esc(doc.book_number)}</span></div>` : ""}
    <div class="metarow"><span>วันที่ออก</span><span>${esc(fmtDateTH(doc.issue_date))}</span></div>
    ${doc.doc_type === "invoice" && doc.due_date ? `<div class="metarow"><span>กำหนดชำระ</span><span>${esc(fmtDateTH(doc.due_date))}</span></div>` : ""}
    ${doc.ref_doc_number ? `<div class="metarow"><span>อ้างถึงใบกำกับภาษีเลขที่</span><span>${esc(doc.ref_doc_number)}</span></div>` : ""}
  </div>
</div>

<table>
  <thead><tr>
    <th class="c" style="width:26px">#</th>
    <th>รายละเอียด</th>
    <th class="r" style="width:52px">จำนวน</th>
    <th style="width:52px">หน่วย</th>
    <th class="r" style="width:74px">ราคา/หน่วย</th>
    <th class="r" style="width:64px">ส่วนลด</th>
    <th class="r" style="width:82px">จำนวนเงิน</th>
  </tr></thead>
  <tbody>${lineRows}</tbody>
</table>

<div class="foot">
  <div class="baht"><b>จำนวนเงิน (ตัวอักษร):</b> ${esc(bahtText(netPayable))}</div>
  <div class="sums">
    <div class="sumrow"><span>มูลค่าสินค้า/บริการ</span><span>${fmt(doc.subtotal)}</span></div>
    ${
      isTax || Number(doc.vat_amount) > 0
        ? `<div class="sumrow"><span>ภาษีมูลค่าเพิ่ม ${fmt(vatRate, 0)}%</span><span>${fmt(doc.vat_amount)}</span></div>`
        : ""
    }
    <div class="sumrow total"><span>ยอดรวมทั้งสิ้น</span><span>${fmt(doc.total)} ฿</span></div>
    ${
      whtAmount > 0
        ? `<div class="sumrow"><span>หัก ณ ที่จ่าย ${fmt(doc.wht_rate, 0)}%</span><span class="neg">−${fmt(whtAmount)}</span></div>
           <div class="sumrow net"><span>ยอดชำระสุทธิ</span><span>${fmt(netPayable)} ฿</span></div>`
        : ""
    }
  </div>
</div>

${doc.note ? `<div class="note"><b>หมายเหตุ:</b> ${esc(doc.note)}</div>` : ""}

<div class="signs">
  <div class="sign">
    <div style="height:44px"></div>
    <div class="line">ผู้รับเงิน / ผู้รับเอกสาร</div>
    <div class="date">วันที่ ......./......./.......</div>
  </div>
  <div class="sign">
    ${signature ? `<img src="${esc(signature)}" alt="">` : `<div style="height:44px"></div>`}
    <div class="line">ผู้มีอำนาจลงนาม</div>
    <div class="date">วันที่ ......./......./.......</div>
  </div>
</div>

</body></html>`;
}
