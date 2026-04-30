import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import { chromium as pwChromium } from "playwright-core";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function safeErrorMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.length > 600 ? `${msg.slice(0, 600)}…` : msg;
}

async function resolveChromiumExecutablePath() {
  const fromEnv =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    process.env.CHROMIUM_PATH ||
    process.env.CHROME_BIN ||
    process.env.GOOGLE_CHROME_BIN;
  if (fromEnv) return fromEnv;

  const platform = process.platform;
  const macCandidates =
    platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
      : [];

  const candidates = [
    ...macCandidates,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome-beta",
    "/usr/bin/google-chrome-unstable",
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      continue;
    }
  }
  return undefined;
}

async function tryRenderViaService(html: string, filenameBase: string) {
  const baseUrl = String(process.env.PDF_RENDER_URL ?? "").trim();
  if (!baseUrl) return null;

  const secret = String(process.env.PDF_SERVICE_SECRET ?? "").trim();
  const url = `${baseUrl.replace(/\/+$/, "")}/render`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-PDF-SECRET": secret } : {}),
    },
    body: JSON.stringify({ html, filename: filenameBase }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PDF service error (${res.status}): ${text || res.statusText}`);
  }

  const ab = await res.arrayBuffer();
  const bytes = Buffer.from(ab);
  const sig = bytes.subarray(0, 4).toString("ascii");
  if (sig !== "%PDF") {
    const snippet = bytes.subarray(0, 250).toString("utf8");
    throw new Error(`PDF service returned non-PDF payload: ${snippet}`);
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

async function renderViaPlaywright(html: string, filenameBase: string) {
  const isLinux = process.platform === "linux";
  const chromiumPath = isLinux ? (await chromium.executablePath()) || (await resolveChromiumExecutablePath()) : await resolveChromiumExecutablePath();
  if (!chromiumPath) {
    throw new Error(
      "Local PDF บน macOS/Windows ไม่รองรับ @sparticuz/chromium. ตั้งค่า PDF_RENDER_URL เพื่อให้ยิงไป Cloud Run หรือกำหนด CHROME_BIN/CHROMIUM_PATH ให้ชี้ไป Chrome ในเครื่อง",
    );
  }
  const args = isLinux ? [...chromium.args, "--no-zygote", "--single-process"] : [];
  const browser = await pwChromium.launch({ executablePath: chromiumPath, args, headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    page.setDefaultTimeout(25_000);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 25_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=\"${filenameBase}.pdf\"`,
      },
    });
  } finally {
    await browser.close();
  }
}

function escapeHtml(input: string) {
  return input
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

function formatTaxIdWithBranch(taxIdRaw: string, branchRaw: string) {
  const taxId = String(taxIdRaw ?? "").trim();
  if (!taxId || taxId === "-") return "-";

  const branch = String(branchRaw ?? "").trim();
  if (!branch || branch === "-") return taxId;

  const normalized = branch.replaceAll(/\s+/g, "");
  if (normalized.includes("สำนักงานใหญ่")) return `${taxId} (สำนักงานใหญ่)`;

  if (/^\d+$/.test(normalized)) return `${taxId} (สาขาที่ ${normalized})`;
  return taxId;
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
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

const thaiDigits = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const thaiPlaces = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function thaiIntToWords(n: number) {
  const s = String(Math.floor(Math.max(0, n)));
  if (s === "0") return thaiDigits[0];

  const parts: string[] = [];
  const chunks: string[] = [];
  for (let i = s.length; i > 0; i -= 6) {
    chunks.unshift(s.substring(Math.max(0, i - 6), i));
  }

  for (let c = 0; c < chunks.length; c++) {
    const chunkStr = chunks[c];
    const len = chunkStr.length;
    let out = "";
    for (let i = 0; i < len; i++) {
      const digit = Number(chunkStr[i] ?? "0");
      const placeIdx = len - i - 1;
      if (digit === 0) continue;

      if (placeIdx === 1) {
        if (digit === 1) out += thaiPlaces[1];
        else if (digit === 2) out += "ยี่" + thaiPlaces[1];
        else out += thaiDigits[digit] + thaiPlaces[1];
        continue;
      }
      if (placeIdx === 0 && digit === 1 && len > 1) {
        out += "เอ็ด";
        continue;
      }
      out += thaiDigits[digit] + thaiPlaces[placeIdx];
    }
    if (!out) continue;
    parts.push(out);
    const remaining = chunks.length - c - 1;
    if (remaining > 0) parts.push("ล้าน".repeat(remaining));
  }
  return parts.join("");
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

function mimeFromFilename(fileName: string | null | undefined) {
  const f = String(fileName ?? "").toLowerCase();
  if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
  if (f.endsWith(".webp")) return "image/webp";
  return "image/png";
}

async function loadUserAssetDataUrls(input: {
  profileId: string;
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}) {
  const res = await input.supabase
    .from("user_assets")
    .select("asset_type,storage_bucket,storage_path,file_name,mime_type")
    .eq("profile_id", input.profileId)
    .in("asset_type", ["signature", "stamp"]);

  if (res.error) return { signatureDataUrl: null as string | null, stampDataUrl: null as string | null };

  let signatureDataUrl: string | null = null;
  let stampDataUrl: string | null = null;

  for (const row of (res.data ?? []) as any[]) {
    const bucket = String(row.storage_bucket ?? "");
    const path = String(row.storage_path ?? "");
    if (!bucket || !path) continue;
    const dl = await input.supabase.storage.from(bucket).download(path);
    if (dl.error || !dl.data) continue;
    const bytes = Buffer.from(await dl.data.arrayBuffer());
    const mime = String(row.mime_type ?? "").trim() || mimeFromFilename(row.file_name);
    const url = `data:${mime};base64,${bytes.toString("base64")}`;
    if (row.asset_type === "signature") signatureDataUrl = url;
    if (row.asset_type === "stamp") stampDataUrl = url;
  }

  return { signatureDataUrl, stampDataUrl };
}

type InvoicePdfRequest = { invoiceId: string; issued_by_profile_id?: string | null };

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as InvoicePdfRequest | null;
    const invoiceId = String(body?.invoiceId ?? "").trim();
    if (!invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const [invRes, itemRes] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id,doc_no,status,issue_date,due_date,customer_snapshot,subtotal,discount_total,include_vat,vat_rate,vat_amount,wht_rate,wht_amount,grand_total,notes,created_by_profile_id",
        )
        .eq("id", invoiceId)
        .single(),
      supabase
        .from("invoice_items")
        .select("name,description,quantity,unit_price,line_total,sort_order")
        .eq("invoice_id", invoiceId)
        .order("sort_order", { ascending: true }),
    ]);
    const firstErr = invRes.error ?? itemRes.error;
    if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 400 });

    const invoice = invRes.data as any;
    if (!invoice?.doc_no) return NextResponse.json({ error: "Invoice has no doc_no yet" }, { status: 400 });

    const createdAt = parseDate(invoice.issue_date) ?? new Date();
    const dueAt = parseDate(invoice.due_date);
    const issuedStr = formatThaiLongDate(createdAt);
    const dueStr = dueAt ? formatThaiLongDate(dueAt) : null;

    const invoiceNo = escapeHtml(String(invoice.doc_no ?? "-") || "-");
    const customerSnapshot = (invoice.customer_snapshot ?? {}) as any;
    const customerName = escapeHtml(String(customerSnapshot.name ?? "-") || "-");
    const customerBranchRaw = String(customerSnapshot.branch_name ?? "").trim();
    const customerAddress =
      escapeHtml(String(customerSnapshot.address ?? "") || "").replaceAll("\n", "<br/>") || "-";
    const customerTaxIdRaw = String(customerSnapshot.tax_id ?? "").trim();
    const customerTaxId = escapeHtml(formatTaxIdWithBranch(customerTaxIdRaw, customerBranchRaw));
    const customerContact = "-";
    const notesText = String(invoice.notes ?? "").trim();
    const notesHtml = escapeHtml(notesText || "-").replaceAll("\n", "<br/>");

    const items = ((itemRes.data ?? []) as any[]).map((it) => ({
      name: String(it.name ?? "-"),
      description: String(it.description ?? ""),
      quantity: Number(it.quantity ?? 0),
      unit_price: Number(it.unit_price ?? 0),
      line_total: Number(it.line_total ?? 0),
    }));

    const perPage = 18;
    const pages = chunk(items, perPage);
    const totalPages = pages.length;

    const subtotal = Number.isFinite(invoice.subtotal) ? Number(invoice.subtotal) : 0;
    const discountTotal = Number.isFinite(invoice.discount_total) ? Number(invoice.discount_total) : 0;
    const afterDiscount = Math.max(0, subtotal - discountTotal);
    const grand = Number.isFinite(invoice.grand_total) ? Number(invoice.grand_total) : 0;
    const vat = Number.isFinite(invoice.vat_amount) ? Number(invoice.vat_amount) : 0;
    const vatRateNum = Number(invoice.vat_rate ?? 0);
    const whtRateNum = Number(invoice.wht_rate ?? 0);
    const wht = Number.isFinite(invoice.wht_amount) ? Number(invoice.wht_amount) : 0;

    const issuedByProfileId = String(body?.issued_by_profile_id ?? "").trim() || String(invoice.created_by_profile_id ?? "").trim();
    const { signatureDataUrl, stampDataUrl } = issuedByProfileId
      ? await loadUserAssetDataUrls({ profileId: issuedByProfileId, supabase })
      : { signatureDataUrl: null, stampDataUrl: null };

    const sheetHtml = (rows: typeof items, pageIndex: number) => {
      const isLast = pageIndex === totalPages - 1;
      const itemsHtml = rows
        .map((it, idx) => {
          const name = escapeHtml(String(it.name ?? "-") || "-");
          const desc = escapeHtml(String(it.description ?? "") || "");
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

      const totalsHtml = isLast
        ? `
        <div class="bottom" id="qt-bottom-block">
        <div class="summary" id="qt-summary-block">
          <div class="summary-left">
            <div class="summary-title"><span>สรุป</span></div>
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
              ${
                invoice.include_vat
                  ? `<div class="summary-line"><div>VAT (${vatRateNum}%)</div><div class="num">${money(vat)} บาท</div></div>`
                  : ``
              }
              ${whtRateNum > 0 ? `<div class="summary-line"><div>หัก ณ ที่จ่าย (${whtRateNum}%)</div><div class="num">-${money(wht)} บาท</div></div>` : ``}
              <div class="summary-line total"><div>ยอดสุทธิ</div><div class="num">${money(grand)} บาท</div></div>
            </div>
          </div>
        </div>

        <div class="qt-footer" id="qt-footer-block">
          <div class="payment" id="qt-payment-block">
            <div class="section-title"><span>ชำระเงิน</span></div>
            <div class="payment-body">
              <div>ธ.กสิกสิรไทย 039-1-36574-1</div>
              <div>บจก. นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์</div>
            </div>
          </div>
          <div class="notes" id="qt-notes-block">
            <div class="section-title"><span>หมายเหตุ</span></div>
            <div class="notes-body">${notesHtml}</div>
          </div>

          <div class="cert">
            <div class="section-title"><span>รับรอง</span></div>
            <div class="cert-grid">
              <div class="sigcard">
                <div class="sigcard-top">
                  <div class="sigrole">ผู้รับเอกสาร</div>
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
                  <div class="sigrole">ผู้ออกเอกสาร</div>
                </div>
                <div class="sigcard-body">
                  <div class="sigimgs">
                    ${signatureDataUrl ? `<img class="signature" alt="signature" src="${signatureDataUrl}" />` : ``}
                    ${stampDataUrl ? `<img class="stamp" alt="stamp" src="${stampDataUrl}" />` : ``}
                  </div>
                  <div class="sigmeta">
                    <div class="sigfield"><span class="k">ลงชื่อ</span><span class="v">&nbsp;</span></div>
                    <div class="sigfield"><span class="k">วันที่</span><span class="v">${escapeHtml(new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(createdAt))}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      `
        : `<div class="continued">หน้าถัดไป…</div>`;

      return `
      <div class="sheet">
        <div class="header">
          <div class="topbar"></div>
          <div class="header-row">
            <div class="logo"><span class="ex">EX</span><span class="worker">WORKER</span></div>
            <div class="doc-title-wrap">
              <div class="doc-copy">INVOICE</div>
              <div class="doc-title">ใบแจ้งหนี้</div>
            </div>
          </div>
        </div>

        <div class="content">
          <div class="top-grid">
            <div class="seller">
              <div class="seller-row"><div class="k">ผู้ขาย :</div><div class="v">บริษัท นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์ จำกัด</div></div>
              <div class="seller-row"><div class="k">เลขที่ภาษี :</div><div class="v">0115559001880 (สำนักงานใหญ่)</div></div>
              <div class="seller-row"><div class="k">ที่อยู่ :</div><div class="v">เลขที่ 6/15 หมู่ที่ 7 ถนน ศรีนครินทร์ ตำบล บางเมือง อำเภอเมืองสมุทรปราการ จังหวัด สมุทรปราการ 10270</div></div>
            </div>
            <div class="docbox">
              <div class="docbox-row"><div class="k">เลขที่เอกสาร :</div><div class="v">${invoiceNo}</div></div>
              <div class="docbox-row"><div class="k">วันที่ออก :</div><div class="v">${issuedStr}</div></div>
              <div class="docbox-row"><div class="k">ครบกำหนด :</div><div class="v">${dueStr ?? "-"}</div></div>
            </div>
          </div>

          <div class="rule"></div>

          <div class="customer">
            <div class="cust-grid">
              <div class="cust-main">
                <div class="cust-row"><div class="k">ลูกค้า :</div><div class="v">${customerName}</div></div>
                <div class="cust-row"><div class="k">เลขที่ภาษี :</div><div class="v">${customerTaxId}</div></div>
                <div class="cust-row"><div class="k">ที่อยู่ :</div><div class="v">${customerAddress}</div></div>
                <div class="cust-row"><div class="k">เรียน :</div><div class="v">${customerContact}</div></div>
              </div>
            </div>
          </div>

          <table class="items">
            <thead>
              <tr>
                <th>บริการ</th>
                <th class="num">จำนวน</th>
                <th class="num">ราคาต่อหน่วย</th>
                <th class="num">รวม</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml || `<tr><td class="empty" colspan="4">ไม่มีรายการ</td></tr>`}
            </tbody>
          </table>

          ${totalsHtml}
          <div class="page-no" data-page-index="${pageIndex + 1}"></div>
        </div>
      </div>
    `;
    };

    const sheetsHtml = pages.map((p, idx) => sheetHtml(p, idx)).join("");
    const footerHostSheet = `
      <div class="sheet qt-footer-sheet" id="qt-footer-sheet" style="display:none">
        <div class="header"></div>
        <div class="content qt-footer-content">
          <div class="qt-footer-host" id="qt-footer-host"></div>
          <div class="page-no" data-page-index="${totalPages + 1}"></div>
        </div>
      </div>
    `;

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

      .sheet { position: relative; width: 210mm; height: 297mm; margin: 0; background: #fff; break-after: page; page-break-after: always; }
      .sheet:last-of-type { break-after: auto; page-break-after: auto; }

      .header { position: relative; height: 114px; padding: 0; }
      .header .topbar { height: 8px; background: linear-gradient(90deg, #0b2441 0%, #2b6cb0 45%, #1e90ff 100%); width: 100%; margin-top: 0; }
      .header-row { display: flex; justify-content: space-between; align-items: flex-end; padding: 16px 34px 0 34px; }
      .logo { font-family: 'Exo 2', sans-serif; font-size: 35px; line-height: 1; letter-spacing: 0px; }
      .logo .ex { font-style: italic; font-weight: 600; color: #0b2441; }
      .logo .worker { font-weight: 300; color: #666; }
      .doc-title-wrap { text-align: right; }
      .doc-copy { font-size: 11px; color: #6b7280; }
      .doc-title { margin-top: 2px; font-weight: 700; font-size: 28px; color: #4aa3df; letter-spacing: 0.3px; }

      .sheet { display: flex; flex-direction: column; }
      .header { flex: 0 0 114px; }
      .content { flex: 1 1 auto; display: flex; flex-direction: column; padding: 10px 34px 14px 34px; }
      .qt-footer { margin-top: auto; break-inside: avoid; page-break-inside: avoid; }
      .qt-footer-sheet .header { display: none; }
      .qt-footer-content { display: flex; flex-direction: column; height: 100%; }
      .qt-footer-host { margin-top: auto; }

      .top-grid { display: grid; grid-template-columns: 1fr 240px; gap: 18px; align-items: start; }
      .seller { font-size: 12px; color: #111827; }
      .seller-row { display: grid; grid-template-columns: 70px 1fr; gap: 8px; margin-top: 6px; }
      .seller-row .k { font-weight: 700; color: #374151; }
      .seller-row .v { color: #111827; }
      .section-title { font-weight: 700; color: #111827; font-size: 12px; }
      .section-title span { background: #eaf4ff; border-radius: 999px; padding: 4px 10px; display: inline-block; }

      .docbox { background: #eaf4ff; border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #111827; }
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
      table.items thead th { background: #eaf4ff; color: #111827; font-weight: 700; padding: 9px 8px; text-align: left; }
      table.items thead th.num { text-align: right; }
      table.items thead th:first-child { border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
      table.items thead th:last-child { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }
      table.items tbody td { padding: 10px 8px; vertical-align: top; border-bottom: 1px solid #eef2f7; }
      table.items tbody tr:last-child td { border-bottom: 0; }

      .item-line { display: grid; grid-template-columns: 22px 1fr; gap: 8px; }
      .item-index { color: #374151; }
      .item-name { font-weight: 500; color: #111827; }
      .item-desc { margin-top: 2px; color: #6b7280; font-size: 11px; }

      .num { text-align: right; white-space: nowrap; }
      .empty { text-align: center; color: #6b7280; padding: 18px 0; }

      .bottom { margin-top: auto; display: flex; flex-direction: column; }
      .summary { display: grid; grid-template-columns: 1fr 310px; gap: 16px; align-items: start; }
      .summary-title { font-weight: 700; color: #111827; font-size: 13px; }
      .summary-words { margin-top: 4px; font-size: 12px; color: #111827; }
      .summary-totalbox { background: #eaf4ff; border-radius: 10px; padding: 12px 14px; }
      .summary-totalbox-title { font-weight: 700; font-size: 12px; color: #111827; }
      .summary-totalbox-amount { margin-top: 6px; font-weight: 700; font-size: 18px; color: #2e7bcf; text-align: right; }
      .summary-totalbox-amount .currency { font-weight: 700; font-size: 12px; color: #111827; }
      .summary-lines { margin-top: 8px; padding: 0 14px; font-size: 11px; color: #111827; }
      .summary-line { display: flex; justify-content: space-between; padding: 3px 0; }
      .summary-line.total { border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 6px; }

      .qt-footer .section-title { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #111827; margin-top: 16px; font-size: 12px; }
      .qt-footer .section-title span { background: transparent; border-radius: 0; padding: 0; display: inline; }

      .qt-footer .payment { margin-top: 14px; border-top: 0; padding-top: 0; }
      .qt-footer .payment-body { margin-top: 10px; min-height: 18px; font-size: 12px; color: #111827; line-height: 1.45; }
      .qt-footer .notes { margin-top: 14px; border-top: 0; padding-top: 0; }
      .qt-footer .notes-body { margin-top: 10px; min-height: 18px; font-size: 12px; color: #111827; line-height: 1.45; }

      .qt-footer .cert { margin-top: 10px; margin-bottom: 26px; }
      .qt-footer .cert-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 10px; align-items: center; }
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
      .sigcard-body { padding: 10px 14px 10px 14px; display: flex; flex: 1 1 auto; flex-direction: column; position: relative; }
      .sigimgs { position: absolute; left: 14px; right: 14px; top: 8px; bottom: 8px; z-index: 2; }
      .sigimgs .signature { position: absolute; left: 28px; bottom: 15px; max-height: 62px; max-width: 190px; object-fit: contain; opacity: 0.98; }
      .sigimgs .stamp { position: absolute; right: 0; bottom: 0; width: 192px; height: auto; object-fit: contain; opacity: 0.92; }
      .sigmeta { margin-top: auto; display: flex; flex-direction: column; gap: 6px; font-size: 12px; position: relative; z-index: 1; }
      .sigfield { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
      .sigfield .k { font-weight: 700; color: #374151; white-space: nowrap; }
      .sigfield .v { color: #111827; white-space: nowrap; min-width: 140px; text-align: right; }

      .continued { text-align: right; font-size: 11px; color: #6b7280; margin-top: 10px; }
      .page-no { position: absolute; right: 34px; bottom: 10px; font-size: 11px; color: #6b7280; }
    </style>
  </head>
  <body>
    ${sheetsHtml}
    ${footerHostSheet}
    <script>
      (function () {
        var bottom = document.getElementById("qt-bottom-block");
        var footerSheet = document.getElementById("qt-footer-sheet");
        var host = document.getElementById("qt-footer-host");
        if (bottom && footerSheet && host) {
          var sheet = bottom.closest(".sheet");
          if (sheet) {
            var bottomRect = bottom.getBoundingClientRect();
            var sheetRect = sheet.getBoundingClientRect();
            var summary = document.getElementById("qt-summary-block");
            var notes = document.getElementById("qt-notes-block");
            var payment = document.getElementById("qt-payment-block");
            var overflow = Math.ceil(bottomRect.bottom) > Math.floor(sheetRect.bottom);
            var overlap = false;
            var firstBlock = payment || notes;
            if (summary && firstBlock) {
              var summaryRect = summary.getBoundingClientRect();
              var firstRect = firstBlock.getBoundingClientRect();
              overlap = Math.floor(firstRect.top) < Math.ceil(summaryRect.bottom + 8);
            }
            if (overflow || overlap) {
              footerSheet.style.display = "";
              host.appendChild(bottom);
            }
          }
        }

        var sheets = Array.prototype.slice.call(document.querySelectorAll('.sheet')).filter(function (el) {
          return window.getComputedStyle(el).display !== 'none';
        });
        var total = sheets.length || 1;
        for (var i = 0; i < sheets.length; i++) {
          var p = sheets[i].querySelector('.page-no');
          if (p) p.textContent = 'หน้า ' + (i + 1) + '/' + total;
        }
      })();
    </script>
  </body>
</html>`;

    const filenameBase = String(invoice.doc_no ?? "IV").replaceAll("/", "-");
    const viaService = await tryRenderViaService(html, filenameBase);
    if (viaService) return viaService;

    return await renderViaPlaywright(html, filenameBase);
  } catch (e: any) {
    return NextResponse.json({ error: safeErrorMessage(e) }, { status: 500 });
  }
}
