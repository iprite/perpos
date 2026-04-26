import { NextResponse } from "next/server";
import { chromium } from "playwright";

export const runtime = "nodejs";

function safeErrorMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.length > 600 ? `${msg.slice(0, 600)}…` : msg;
}

type QuotePdfRequest = {
  quote: {
    id: string;
    quote_no: string;
    customer_name: string;
    customer_company: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    billing_address: string | null;
    notes?: string | null;
    currency: string;
    subtotal: number;
    discount_total: number;
    include_vat: boolean;
    vat_rate: number;
    vat_amount: number;
    wht_rate: number;
    wht_amount: number;
    tax_total: number;
    grand_total: number;
    valid_until: string | null;
    status: string;
    approved_at: string | null;
    created_at: string;
  };
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    task_list?: unknown;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseDate(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatThaiLongDate(d: Date) {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function thaiIntToWords(n: number) {
  const digit = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const unit = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
  const toSection = (x: number) => {
    const s = String(Math.floor(x));
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const d = Number(s[i] ?? 0);
      const pos = s.length - i - 1;
      if (d === 0) continue;
      if (pos === 0) {
        if (d === 1 && s.length > 1) out += "เอ็ด";
        else out += digit[d];
        continue;
      }
      if (pos === 1) {
        if (d === 1) out += "สิบ";
        else if (d === 2) out += "ยี่สิบ";
        else out += `${digit[d]}สิบ`;
        continue;
      }
      out += `${digit[d]}${unit[pos] ?? ""}`;
    }
    return out || digit[0];
  };

  const x = Math.floor(Math.max(0, n));
  if (x === 0) return digit[0];

  const parts: string[] = [];
  let cur = x;
  while (cur > 0) {
    parts.push(String(cur % 1_000_000));
    cur = Math.floor(cur / 1_000_000);
  }

  let out = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const section = Number(parts[i] ?? 0);
    if (section === 0) continue;
    out += toSection(section);
    if (i > 0) out += "ล้าน";
  }
  return out;
}

function thaiBahtText(amount: number) {
  const a = Number.isFinite(amount) ? amount : 0;
  const baht = Math.floor(Math.max(0, a));
  const satang = Math.round((Math.max(0, a) - baht) * 100);
  const bahtText = `${thaiIntToWords(baht)}บาท`;
  if (satang <= 0) return `${bahtText}ถ้วน`;
  return `${bahtText}${thaiIntToWords(satang)}สตางค์`;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out.length ? out : [[]];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as QuotePdfRequest;
    const quote = body.quote;
    const items = body.items ?? [];

  const createdAt = parseDate(quote.created_at) ?? new Date();
  const validUntil = parseDate(quote.valid_until);
  const approvedAt = parseDate(quote.approved_at);
  const createdStr = formatThaiLongDate(createdAt);
  const validStr = validUntil ? formatThaiLongDate(validUntil) : null;
  const approvedStr = approvedAt ? formatThaiLongDate(approvedAt) : null;
  const issuedStr = approvedStr ?? "-";

  const quoteNo = escapeHtml(String(quote.quote_no ?? "-") || "-");
  const customerName = escapeHtml(String(quote.customer_name ?? "-") || "-");
  const billingAddress = escapeHtml(String(quote.billing_address ?? "") || "").replaceAll("\n", "<br/>");
  const notesHtml = escapeHtml(String(quote.notes ?? "") || "").replaceAll("\n", "<br/>");

  const perPage = 18;
  const pages = chunk(items, perPage);
  const totalPages = pages.length;

  const sheetHtml = (rows: QuotePdfRequest["items"], pageIndex: number) => {
    const isLast = pageIndex === totalPages - 1;
    const itemsHtml = rows
      .map((it, idx) => {
        const name = escapeHtml(String(it.name ?? "-") || "-");
        const desc = escapeHtml(String(it.description ?? "") || "");
        const taskListRaw = (it as any).task_list as unknown;
        const tasks = Array.isArray(taskListRaw) ? taskListRaw.filter((x) => typeof x === "string" && x.trim().length) : [];
        const tasksHtml = tasks.length
          ? `<ul class="item-tasks">${tasks.map((t) => `<li>${escapeHtml(t.trim())}</li>`).join("")}</ul>`
          : ``;
        const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
        const unit = Number.isFinite(it.unit_price) ? it.unit_price : 0;
        const total = Number.isFinite(it.line_total) ? it.line_total : qty * unit;
        return `
          <tr>
            <td>
              <div class="item-line">
                <div class="item-index">${pageIndex * perPage + idx + 1}.</div>
                <div class="item-text">
                  <div class="item-name">${name}</div>
                  ${desc ? `<div class="item-desc">${desc}</div>` : ``}
                  ${tasksHtml}
                </div>
              </div>
            </td>
            <td class="num">${qty.toFixed(2)}</td>
            <td class="num">${money(unit)}</td>
            <td class="num">${money(total)}</td>
          </tr>
        `;
      })
      .join("");

    const subtotal = Number.isFinite(quote.subtotal) ? Number(quote.subtotal) : 0;
    const discountTotal = Number.isFinite(quote.discount_total) ? Number(quote.discount_total) : 0;
    const afterDiscount = Math.max(0, subtotal - discountTotal);
    const grand = Number.isFinite(quote.grand_total) ? Number(quote.grand_total) : 0;
    const vatRateNum = Number(quote.vat_rate ?? 0);
    const vat = Number.isFinite(quote.vat_amount) ? Number(quote.vat_amount) : 0;
    const whtRateNum = Number(quote.wht_rate ?? 0);
    const wht = Number.isFinite(quote.wht_amount) ? Number(quote.wht_amount) : 0;

    const totalsHtml = isLast
      ? `
        <div class="bottom">
        <div class="summary">
          <div class="summary-left">
            <div class="summary-title">
              <span>สรุป</span>
            </div>
            <div class="summary-words">จำนวนเงินทั้งหมด ${escapeHtml(thaiBahtText(grand))}</div>
          </div>
          <div class="summary-right">
            <div class="summary-totalbox">
              <div class="summary-totalbox-title">จำนวนเงินที่ต้องชำระทั้งสิ้น</div>
              <div class="summary-totalbox-amount">${money(grand)} <span class="currency">บาท</span></div>
            </div>
            <div class="summary-lines">
              ${
                discountTotal > 0
                  ? `<div class="summary-line"><div>รวมก่อนส่วนลด</div><div class="num">${money(subtotal)} บาท</div></div>
                     <div class="summary-line"><div>ส่วนลด</div><div class="num">${money(discountTotal)} บาท</div></div>
                     <div class="summary-line"><div>ยอดหลังส่วนลด</div><div class="num">${money(afterDiscount)} บาท</div></div>`
                  : ``
              }
              ${quote.include_vat ? `<div class="summary-line"><div>VAT (${vatRateNum}%)</div><div class="num">${money(vat)} บาท</div></div>` : ``}
              ${whtRateNum > 0 ? `<div class="summary-line"><div>หัก ณ ที่จ่าย (${whtRateNum}%)</div><div class="num">-${money(wht)} บาท</div></div>` : ``}
              <div class="summary-line total"><div>ยอดสุทธิ</div><div class="num">${money(grand)} บาท</div></div>
            </div>
          </div>
        </div>

        <div class="pay">
          <div class="section-title"><span>ชำระเงิน</span></div>
          <div class="pay-grid">
            <div class="pay-item">
              <div class="pay-bank">ธ.กสิกสิรไทย</div>
              <div class="pay-sub">039-1-36574-1</div>
              <div class="pay-sub">บจก. นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์</div>
            </div>
          </div>
        </div>

        <div class="notes">
          <div class="section-title"><span>หมายเหตุ</span></div>
          <div class="notes-body">${notesHtml || "&nbsp;"}</div>
        </div>

        <div class="cert">
          <div class="section-title"><span>รับรอง</span></div>
          <div class="cert-grid">
            <div class="sigcard">
              <div class="sigcard-top">
                <div class="sigrole">ผู้อนุมัติซื้อ</div>
              </div>
              <div class="sigcard-body">
                <div class="sigmeta">
                  <div class="sigfield"><span class="k">ลงชื่อ</span><span class="v">&nbsp;</span></div>
                  <div class="sigfield"><span class="k">วันที่</span><span class="v">&nbsp;</span></div>
                </div>
              </div>
            </div>
            <div class="sigcard">
              <div class="sigcard-top">
                <div class="sigrole">ผู้จัดทำเอกสาร</div>
              </div>
              <div class="sigcard-body">
                <div class="sigmeta">
                  <div class="sigfield"><span class="k">ลงชื่อ</span><span class="v">&nbsp;</span></div>
                  <div class="sigfield"><span class="k">วันที่</span><span class="v">${escapeHtml(new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(createdAt))}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      `
      : `
        <div class="continued">(ต่อหน้า ${pageIndex + 2}/${totalPages})</div>
      `;

    return `
      <div class="sheet">
        <div class="header">
          <div class="topbar"></div>
          <div class="header-row">
            <div class="logo"><span class="ex">EX</span><span class="worker">WORKER</span></div>
            <div class="doc-title-wrap">
              <div class="doc-copy">(ต้นฉบับ)</div>
              <div class="doc-title">ใบเสนอราคา</div>
            </div>
          </div>
        </div>

        <div class="content">
          <div class="top-grid">
            <div class="seller">
              <div class="seller-row"><div class="k">ผู้ขาย :</div><div class="v">บริษัท นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์ จำกัด</div></div>
              <div class="seller-row"><div class="k">ที่อยู่ :</div><div class="v">เลขที่ 6/15 หมู่ที่ 7 ถนน ศรีนครินทร์ ตำบล บางเมือง อำเภอเมืองสมุทรปราการ จังหวัด สมุทรปราการ 10270</div></div>
              <div class="seller-row"><div class="k">เลขที่ภาษี :</div><div class="v">0115559001880 (สำนักงานใหญ่)</div></div>
            </div>
            <div class="docbox">
              <div class="docbox-row"><div class="k">เลขที่เอกสาร :</div><div class="v">${quoteNo}</div></div>
              <div class="docbox-row"><div class="k">วันที่ออก :</div><div class="v">${issuedStr}</div></div>
            </div>
          </div>

          <div class="rule"></div>

          <div class="customer">
            <div class="cust-grid">
              <div class="cust-main">
                <div class="cust-row"><div class="k">ลูกค้า :</div><div class="v">${customerName}</div></div>
                <div class="cust-row"><div class="k">ที่อยู่ :</div><div class="v">${billingAddress || "-"}</div></div>
                <div class="cust-row"><div class="k">เลขที่ภาษี :</div><div class="v">-</div></div>
                <div class="cust-row"><div class="k">เรียน :</div><div class="v">-</div></div>
              </div>
            </div>
          </div>

          <table class="items">
            <thead>
              <tr>
                <th>บริการ</th>
                <th class="num">จำนวน</th>
                <th class="num">ราคา</th>
                <th class="num">มูลค่า</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml || `<tr><td colspan="4" class="empty">-</td></tr>`}
            </tbody>
          </table>

          ${totalsHtml}

          <div class="page-no">หน้า ${pageIndex + 1}/${totalPages}</div>
        </div>
      </div>
    `;
  };

  const sheetsHtml = pages.map((p, idx) => sheetHtml(p, idx)).join("");

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,200;0,300;0,400;0,500;0,600;1,600&family=Noto+Sans+Thai:wght@300;400;500;600&display=swap" rel="stylesheet" />
    <style>
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; }
      body { font-family: 'Noto Sans Thai', sans-serif; font-weight: 300; color: #333; }

      .sheet {
        position: relative;
        width: 210mm;
        height: 297mm;
        margin: 0;
        background: #fff;
        break-after: page;
        page-break-after: always;
      }
      .sheet:last-of-type {
        break-after: auto;
        page-break-after: auto;
      }

      .header {
        position: relative;
        height: 114px;
        padding: 0;
      }
      .header .topbar {
        height: 8px;
        background: linear-gradient(90deg, #0b2441 0%, #2b6cb0 45%, #1e90ff 100%);
        width: 100%;
        margin-top: 0;
      }
      .header-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 16px 34px 0 34px;
      }
      .logo {
        font-family: 'Exo 2', sans-serif;
        font-size: 35px;
        line-height: 1;
        letter-spacing: 0px;
      }
      .logo .ex { font-style: italic; font-weight: 600; color: #0b2441; }
      .logo .worker { font-weight: 300; color: #666; }

      .doc-title-wrap { text-align: right; }
      .doc-copy { font-size: 11px; color: #6b7280; }
      .doc-title { margin-top: 2px; font-weight: 700; font-size: 28px; color: #4aa3df; letter-spacing: 0.3px; }


      .sheet { display: flex; flex-direction: column; }
      .header { flex: 0 0 114px; }
      .content { flex: 1 1 auto; display: flex; flex-direction: column; padding: 10px 34px 14px 34px; }

      .top-grid { display: grid; grid-template-columns: 1fr 240px; gap: 18px; align-items: start; }
      .seller { font-size: 12px; color: #111827; }
      .seller-row { display: grid; grid-template-columns: 70px 1fr; gap: 8px; margin-top: 6px; }
      .seller-row .k { font-weight: 700; color: #374151; }
      .seller-row .v { color: #111827; }
      .seller-contacts { display: grid; grid-template-columns: 1fr; gap: 6px; margin-top: 10px; }
      .contact { display: flex; gap: 8px; align-items: center; color: #111827; }
      .ci { display: inline-flex; width: 16px; justify-content: center; color: #6b7280; font-size: 11px; line-height: 1; }

      .docbox {
        background: #eaf4ff;
        border-radius: 10px;
        padding: 12px 14px;
        font-size: 12px;
        color: #111827;
      }
      .docbox-row { display: grid; grid-template-columns: 92px 1fr; gap: 8px; margin-top: 6px; }
      .docbox-row:first-child { margin-top: 0; }
      .docbox-row .k { font-weight: 700; color: #374151; }
      .docbox-row .v { font-weight: 600; color: #111827; }

      .rule { height: 1px; background: #e5e7eb; margin: 14px 0; }

      .customer { font-size: 12px; }
      .cust-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
      .cust-row { display: grid; grid-template-columns: 70px 1fr; gap: 8px; margin-top: 6px; }
      .cust-row .k { font-weight: 700; color: #374151; }
      .cust-row .v { color: #111827; }

      table.items { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 14px; }
      table.items thead th {
        background: #eaf4ff;
        color: #111827;
        font-weight: 700;
        padding: 9px 8px;
        text-align: left;
      }
      table.items thead th.num { text-align: right; }
      table.items thead th:first-child { border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
      table.items thead th:last-child { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }
      table.items tbody td { padding: 10px 8px; vertical-align: top; border-bottom: 1px solid #eef2f7; }
      table.items tbody tr:last-child td { border-bottom: 0; }

      .item-line { display: grid; grid-template-columns: 22px 1fr; gap: 8px; }
      .item-index { color: #374151; }
      .item-name { font-weight: 500; color: #111827; }
      .item-desc { margin-top: 2px; color: #6b7280; font-size: 11px; }
      .item-tasks { margin: 4px 0 0 0; padding-left: 16px; color: #4b5563; font-size: 11px; line-height: 1.35; }
      .item-tasks li { margin-top: 2px; }

      .num { text-align: right; white-space: nowrap; }
      .center { text-align: center; white-space: nowrap; }
      .empty { text-align: center; color: #6b7280; padding: 18px 0; }

      .bottom { margin-top: auto; }
      .summary { display: grid; grid-template-columns: 1fr 310px; gap: 16px; align-items: start; }
      .summary-title { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #111827; }
      .summary-icon { color: #111827; }
      .summary-words { margin-top: 10px; font-size: 12px; color: #111827; }

      .summary-totalbox { background: #eaf4ff; border-radius: 10px; padding: 12px 14px; }
      .summary-totalbox-title { font-weight: 700; font-size: 12px; color: #111827; }
      .summary-totalbox-amount { margin-top: 6px; font-weight: 700; font-size: 18px; color: #2e7bcf; text-align: right; }
      .summary-totalbox-amount .currency { font-weight: 700; font-size: 12px; color: #111827; }
      .summary-lines { margin-top: 8px; padding: 0 14px; font-size: 11px; color: #111827; }
      .summary-line { display: flex; justify-content: space-between; padding: 3px 0; }
      .summary-line.total { border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 6px; }

      .section-title { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #111827; margin-top: 16px; }

      .pay { margin-top: 18px; }
      .pay-grid { display: grid; grid-template-columns: 1fr; gap: 18px; margin-top: 10px; }
      .pay-item { font-size: 12px; }
      .pay-bank { font-weight: 700; }
      .pay-sub { margin-top: 3px; color: #111827; }

      .notes { margin-top: 14px; }
      .notes-body { margin-top: 10px; min-height: 18px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 12px; color: #111827; }

      .cert { margin-top: 10px; margin-bottom: 26px; }
      .cert-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 10px; align-items: center; }
      .sigcard {
        border: 1px solid #dbe7f7;
        border-radius: 14px;
        background: linear-gradient(180deg, #f4f9ff 0%, #ffffff 70%);
        height: 118px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .sigcard-top {
        padding: 10px 12px;
        background: rgba(74, 163, 223, 0.12);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .sigrole { font-weight: 700; font-size: 12px; color: #0b2441; }
      .sigcard-body { padding: 10px 14px 10px 14px; display: flex; flex: 1 1 auto; flex-direction: column; }
      .sigmeta { margin-top: auto; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
      .sigfield { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
      .sigfield .k { font-weight: 700; color: #374151; white-space: nowrap; }
      .sigfield .v { color: #111827; white-space: nowrap; min-width: 140px; text-align: right; }

      .continued { text-align: right; font-size: 11px; color: #6b7280; margin-top: 10px; }
      .page-no { position: absolute; right: 34px; bottom: 10px; font-size: 11px; color: #6b7280; }
    </style>
  </head>
  <body>
    ${sheetsHtml}
  </body>
</html>`;

    const browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
      page.setDefaultTimeout(15_000);
      await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });

      return new NextResponse(pdf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=\"${quoteNo}.pdf\"`,
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    return new NextResponse(`สร้าง PDF ไม่สำเร็จ: ${safeErrorMessage(e)}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
