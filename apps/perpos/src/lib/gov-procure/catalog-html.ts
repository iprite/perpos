/**
 * lib/gov-procure/catalog-html.ts — HTML A4 ของเอกสารแคตตาล็อก (ส่งเข้า services/pdf-renderer)
 *
 * contract: `.ui.md §5.1` (เทมเพลต A — ตาราง 6 คอลัมน์) · `§5.2` (เทมเพลต B — บรรยาย + หัวจดหมายทุกหน้า)
 *           `§5.9 A-6` (escape เป็นกลไก) · `B-P1-6` (ลายน้ำ "ฉบับร่าง") · `B-P1-7` (page-break)
 *
 * กฎของไฟล์นี้ (binding):
 *  1. **ค่าจากผู้ใช้/AI ทุกค่าต้องผ่าน `esc()` ตัวเดียวนี้** — ครอบทั้ง text context และ attribute
 *     context (`img src/alt/title`) · URL รูปต้องผ่าน `safeImageSrc()` (กัน `javascript:`)
 *  2. 🚫 **ห้ามอ่าน/พิมพ์ "ฟิลด์คำเตือนของ AI" เด็ดขาด (C-B1)** — เป็น "สิ่งที่ AI ไม่มั่นใจ" ของหน้า review
 *     (ชื่อฟิลด์ในตารางห้ามปรากฏในไฟล์นี้แม้แต่ในคอมเมนต์ — self-grep ต้องได้ 0)
 *     "ข้อควรระวัง" ที่ขึ้นเอกสาร = **`caution_notes`** เท่านั้น (เทมเพลต B)
 *  3. เอกสารพิมพ์ = **ขาว / ดำ / เส้นเทา** (DESIGN §13.5) — ไม่ใช้พาเลตต์หน้าจอ
 */

import type { Catalog, CatalogItem, CatalogTemplate, LetterheadSnapshot } from "./catalog";

// ---------------------------------------------------------------------------
// Escaping (A-6) — ตัวเดียว ใช้ทั้ง text และ attribute
// ---------------------------------------------------------------------------

/** escape ค่าผู้ใช้ทุกชนิด (ปลอดภัยทั้งใน text node และใน attribute ที่ครอบด้วย ") */
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

/** อนุญาตเฉพาะ https/http (signed URL จาก storage) และ data:image — นอกนั้นทิ้ง */
export function safeImageSrc(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const v = url.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(v)) return v;
  return null;
}

const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/** เพดานขนาดโลโก้ (ตัวอักษรของ data URL) — ใหญ่กว่านี้ไม่พิมพ์ */
export const MAX_LOGO_DATA_URL_BYTES = 500 * 1024;

/** โลโก้ต้องเป็น data URL png/jpeg/webp และ ≤500KB เท่านั้น (A-6) */
export function isValidLogoDataUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  if (v.length > MAX_LOGO_DATA_URL_BYTES) return false;
  return LOGO_DATA_URL_RE.test(v);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function money(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function qtyText(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(v);
}

function lines(v: string | null | undefined): string[] {
  return String(v ?? "")
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter((s) => s.length > 0) : [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildCatalogHtmlOpts {
  /** signed URL ของรูปต่อ item id (route สร้างฝั่ง server ก่อน build · TTL ≤300s) */
  imageUrls?: Record<string, string>;
  /** override โหมดราคา (default = `catalog.show_prices`) */
  showPrices?: boolean;
  /** override เทมเพลต (default = `catalog.template`) */
  template?: CatalogTemplate;
}

/**
 * Running footer สำหรับ pdf-renderer (Playwright `displayHeaderFooter`) —
 * ใช้คู่กับลายน้ำในหน้าเอกสารได้ (route จะส่งหรือไม่ส่งก็ได้)
 * NOTE: template นี้ไม่ inherit CSS ของ body → inline style ทั้งหมด
 */
export function buildCatalogFooterTemplate(notVerifiedCount: number): string {
  if (notVerifiedCount <= 0) return `<div style="height:0"></div>`;
  return (
    `<div style="width:100%; box-sizing:border-box; padding:0 12mm; ` +
    `font-family:'Sarabun','Noto Sans Thai',sans-serif; font-size:7pt; color:#9ca3af; text-align:center;">` +
    `ฉบับร่าง — ยังมี ${esc(String(notVerifiedCount))} รายการที่ยังไม่ผ่านการตรวจสอบ` +
    `</div>`
  );
}

/** สร้าง HTML เอกสารแคตตาล็อก (เทมเพลต A ตาราง / B บรรยาย) */
export function buildCatalogHtml(
  catalog: Catalog,
  items: CatalogItem[],
  opts: BuildCatalogHtmlOpts = {},
): string {
  const template: CatalogTemplate = opts.template ?? catalog.template ?? "table";
  const showPrices = opts.showPrices ?? catalog.show_prices ?? false;
  const rows = [...(items ?? [])].sort((a, b) => (a.seq_no ?? 0) - (b.seq_no ?? 0));
  const notVerified = rows.filter((i) => i.source !== "human_verified").length;
  const imageUrls = opts.imageUrls ?? {};

  const body =
    template === "narrative"
      ? renderNarrative(catalog, rows, { showPrices, imageUrls })
      : renderTable(catalog, rows, { showPrices, imageUrls });

  return shell(catalog, body, { template, notVerified });
}

// ---------------------------------------------------------------------------
// Shell (styles + ลายน้ำฉบับร่าง)
// ---------------------------------------------------------------------------

function shell(
  catalog: Catalog,
  body: string,
  meta: { template: CatalogTemplate; notVerified: number },
): string {
  const draft =
    meta.notVerified > 0
      ? `<div class="draft-mark">ฉบับร่าง — ยังมี ${esc(
          String(meta.notVerified),
        )} รายการที่ยังไม่ผ่านการตรวจสอบ</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>${esc(catalog.title || "แคตตาล็อกสินค้า")}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Sarabun', 'Noto Sans Thai', 'TLwg Typist', sans-serif;
    font-size: 9pt; line-height: 1.35; color: #000; background: #fff; margin: 0;
  }
  .doc-title { font-size: 11pt; font-weight: 700; margin: 0 0 6px; }
  .doc-title-center { text-align: center; }

  /* ── เทมเพลต A — ตาราง ─────────────────────────────────────────── */
  table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.items thead { display: table-header-group; }
  table.items th, table.items td {
    border: 0.5pt solid #555; padding: 4px 5px; vertical-align: top;
    word-wrap: break-word; overflow-wrap: break-word;
  }
  table.items th { font-size: 9pt; font-weight: 700; text-align: center; vertical-align: middle; }
  table.items tr { page-break-inside: avoid; break-inside: avoid; }
  table.items tr.tall { page-break-inside: auto; break-inside: auto; }
  td.c { text-align: center; vertical-align: middle; }
  td.r { text-align: right; font-variant-numeric: tabular-nums; }
  td.m { vertical-align: middle; }
  .num { font-variant-numeric: tabular-nums; }
  .desc-head { margin-top: 3px; }
  .desc-line { margin: 0; }
  .img-cell img { max-width: 100%; max-height: 110px; }
  .img-none {
    border: 1px dashed #999; height: 90px; display: flex; align-items: center;
    justify-content: center; color: #666; font-size: 8pt;
  }
  tr.total-row td { font-weight: 700; border-top: 1.5pt solid #333; }

  /* ── เทมเพลต B — บรรยาย ────────────────────────────────────────── */
  table.frame { width: 100%; border-collapse: collapse; }
  table.frame thead { display: table-header-group; }
  table.frame th, table.frame td { border: 0; padding: 0; text-align: left; }
  .letterhead { width: 100%; padding-bottom: 18px; }
  .letterhead-inner { display: flex; align-items: flex-start; justify-content: space-between; }
  .letterhead img { max-height: 70px; max-width: 40%; }
  .letterhead .addr { text-align: right; font-weight: 700; font-size: 9pt; line-height: 1.4; }
  .item { page-break-inside: avoid; break-inside: avoid; padding-bottom: 18px; }
  .item.tall { page-break-inside: auto; break-inside: auto; }
  .item::after { content: ""; display: block; clear: both; }
  .item-title { font-size: 12pt; font-weight: 700; margin: 0 0 4px; }
  .item-img { float: right; width: 38%; max-height: 260px; margin: 0 0 8px 12px; }
  .item-img img { width: 100%; max-height: 260px; object-fit: contain; }
  .item-img.center { float: none; width: 100%; text-align: center; margin: 8px 0 0; }
  .sub-head { margin-top: 6px; }
  .sub-row { display: flex; }
  .sub-row .sub-name { width: 60%; }
  .sub-row .sub-qty { font-variant-numeric: tabular-nums; }

  /* ── draft watermark (B-P1-6) — Chromium ทำซ้ำ element แบบ fixed ทุกหน้า ──
     หมายเหตุ: จงใจไม่เขียนคำไทยของลายน้ำในคอมเมนต์นี้ — เทสยืนยันว่า
     "เอกสารที่ยืนยันครบต้องไม่มีคำนั้นใน HTML เลย" คอมเมนต์จะทำให้เทสผ่านทั้งที่ผิด ── */
  .draft-mark {
    position: fixed; left: 0; right: 0; bottom: 0;
    text-align: center; font-size: 7pt; color: #9ca3af;
  }
</style>
</head>
<body>
${body}
${draft}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// เทมเพลต A — ตาราง (ไม่มีหัวจดหมาย ตรงเอกสารต้นฉบับ)
// ---------------------------------------------------------------------------

interface RenderCtx {
  showPrices: boolean;
  imageUrls: Record<string, string>;
}

/** แถวสูงเกิน ~60% ของหน้า → ยอมให้ break (B-P1-7) */
function isTallItem(item: CatalogItem): boolean {
  const count =
    strArray(item.bullets).length +
    lines(item.size_line).length +
    strArray(item.care_notes).length +
    strArray(item.caution_notes).length +
    (Array.isArray(item.sub_items) ? item.sub_items.length : 0);
  return count > 24;
}

function imageCell(item: CatalogItem, ctx: RenderCtx): string {
  const src = safeImageSrc(ctx.imageUrls[item.id]);
  if (!src) return `<div class="img-none">รอรูปสินค้า</div>`;
  return `<img src="${esc(src)}" alt="${esc(item.name)}" title="${esc(item.name)}" />`;
}

function descriptionCell(item: CatalogItem): string {
  const out: string[] = [];
  if (item.spec_line) out.push(`<div class="desc-line">${esc(item.spec_line)}</div>`);
  for (const l of lines(item.size_line)) {
    out.push(`<div class="desc-line">- ${esc(l)}</div>`);
  }
  const bullets = strArray(item.bullets);
  if (bullets.length > 0) {
    out.push(`<div class="desc-head">รายละเอียดสินค้า</div>`);
    for (const b of bullets) out.push(`<div class="desc-line">- ${esc(b)}</div>`);
  }
  return out.join("\n");
}

function renderTable(catalog: Catalog, rows: CatalogItem[], ctx: RenderCtx): string {
  const priceCols = ctx.showPrices;
  const widths = priceCols
    ? ["5%", "15%", "32%", "7%", "7%", "8%", "9%", "18%"]
    : ["5%", "15%", "44%", "7%", "7%", "22%"];

  const cols = widths.map((w) => `<col style="width:${w}" />`).join("");

  const head = priceCols
    ? `<tr><th>ลำดับ</th><th>ชื่อสินค้า</th><th>คำอธิบายสินค้า</th><th>จำนวน</th><th>หน่วย</th><th>ราคา/หน่วย (฿)</th><th>รวม (฿)</th><th>รูปสินค้า</th></tr>`
    : `<tr><th>ลำดับ</th><th>ชื่อสินค้า</th><th>คำอธิบายสินค้า</th><th>จำนวน</th><th>หน่วย</th><th>รูปสินค้า</th></tr>`;

  let grandTotal = 0;
  const bodyRows = rows
    .map((item) => {
      const tall = isTallItem(item) ? " tall" : "";
      const lineTotal =
        typeof item.qty === "number" && typeof item.unit_price_ref === "number"
          ? item.qty * item.unit_price_ref
          : null;
      if (lineTotal !== null) grandTotal += lineTotal;

      const priceCells = priceCols
        ? `<td class="r m">${esc(money(item.unit_price_ref))}</td>` +
          `<td class="r m">${esc(lineTotal === null ? "" : money(lineTotal))}</td>`
        : "";

      return (
        `<tr class="item-row${tall}">` +
        `<td class="c num">${esc(String(item.seq_no ?? ""))}</td>` +
        `<td class="m">${esc(item.name)}</td>` +
        `<td>${descriptionCell(item)}</td>` +
        `<td class="c num">${esc(qtyText(item.qty))}</td>` +
        `<td class="c">${esc(item.unit ?? "")}</td>` +
        priceCells +
        `<td class="c img-cell">${imageCell(item, ctx)}</td>` +
        `</tr>`
      );
    })
    .join("\n");

  // แถวรวม = แถวธรรมดาท้ายตาราง (ไม่ใช้ tfoot — Chromium จะทำซ้ำทุกหน้า)
  const totalRow = priceCols
    ? `<tr class="total-row"><td class="r" colspan="6">รวมทั้งสิ้น</td>` +
      `<td class="r">${esc(money(grandTotal))}</td><td></td></tr>`
    : "";

  return (
    `<div class="doc-title">${esc(catalog.title || "แคตตาล็อกสินค้า")}</div>` +
    `<table class="items"><colgroup>${cols}</colgroup>` +
    `<thead>${head}</thead>` +
    `<tbody>${bodyRows}${totalRow}</tbody></table>`
  );
}

// ---------------------------------------------------------------------------
// เทมเพลต B — บรรยาย (หัวจดหมายทุกหน้า จาก letterhead_snapshot)
// ---------------------------------------------------------------------------

function letterheadHtml(snapshot: LetterheadSnapshot | null): string {
  if (!snapshot) return "";
  const logo = isValidLogoDataUrl(snapshot.logo_data_url)
    ? `<img src="${esc(snapshot.logo_data_url)}" alt="โลโก้บริษัท" />`
    : `<span></span>`;

  const addr = [
    snapshot.company_name ?? "",
    ...(Array.isArray(snapshot.address_lines) ? snapshot.address_lines : []),
    snapshot.phone ? `โทร ${snapshot.phone}` : "",
    snapshot.tax_id ? `ทะเบียนนิติบุคคลเลขที่ ${snapshot.tax_id}` : "",
  ]
    .map((l) => String(l ?? "").trim())
    .filter((l) => l.length > 0)
    .map((l) => `<div>${esc(l)}</div>`)
    .join("");

  return `<div class="letterhead"><div class="letterhead-inner">${logo}<div class="addr">${addr}</div></div></div>`;
}

function subItemsHtml(item: CatalogItem): string {
  const subs = Array.isArray(item.sub_items) ? item.sub_items : [];
  if (subs.length === 0) return "";
  return subs
    .map((s, i) => {
      const qtyUnit = [qtyText(s?.qty), String(s?.unit ?? "").trim()]
        .filter((x) => x.length > 0)
        .join(" ");
      return `<div class="sub-row"><div class="sub-name">${esc(
        `${i + 1}.${String(s?.name ?? "")}`,
      )}</div><div class="sub-qty">${esc(qtyUnit)}</div></div>`;
    })
    .join("");
}

function narrativeItem(item: CatalogItem, ctx: RenderCtx): string {
  const parts: string[] = [];
  const src = safeImageSrc(ctx.imageUrls[item.id]);
  const bullets = strArray(item.bullets);
  const care = strArray(item.care_notes);
  // ⚠️ "ข้อควรระวัง" ที่ขึ้นเอกสาร = caution_notes เท่านั้น (ฟิลด์คำเตือนของ AI ห้ามเข้าเอกสาร — C-B1)
  const caution = strArray(item.caution_notes);
  const subs = Array.isArray(item.sub_items) ? item.sub_items : [];
  const shortBody = bullets.length + care.length + caution.length + subs.length <= 3;

  parts.push(`<div class="item-title">${esc(`${item.seq_no}.${item.name}`)}</div>`);

  if (src && !shortBody) {
    parts.push(
      `<div class="item-img"><img src="${esc(src)}" alt="${esc(item.name)}" title="${esc(
        item.name,
      )}" /></div>`,
    );
  }

  if (item.spec_line) parts.push(`<div>${esc(item.spec_line)}</div>`);
  for (const l of lines(item.size_line)) parts.push(`<div>${esc(l)}</div>`);

  if (ctx.showPrices && typeof item.unit_price_ref === "number") {
    const label = subs.length > 0 ? "ราคาชุดละ" : "ราคา";
    const unit = item.unit ? `/${item.unit}` : "";
    parts.push(
      `<div class="num">${esc(`${label} ${money(item.unit_price_ref)} บาท${unit}`)}</div>`,
    );
  }

  if (subs.length > 0) {
    parts.push(`<div class="sub-head">รายการย่อย</div>`);
    parts.push(subItemsHtml(item));
  }

  if (bullets.length > 0) {
    parts.push(`<div class="sub-head">รายละเอียดสินค้า</div>`);
    for (const b of bullets) parts.push(`<div>${esc(b)}</div>`);
  }
  if (care.length > 0) {
    parts.push(`<div class="sub-head">วิธีการดูแลรักษา</div>`);
    for (const c of care) parts.push(`<div>${esc(c)}</div>`);
  }
  if (caution.length > 0) {
    parts.push(`<div class="sub-head">ข้อควรระวัง</div>`);
    for (const c of caution) parts.push(`<div>${esc(c)}</div>`);
  }

  if (src && shortBody) {
    parts.push(
      `<div class="item-img center"><img src="${esc(src)}" alt="${esc(
        item.name,
      )}" title="${esc(item.name)}" /></div>`,
    );
  }

  const tall = isTallItem(item) ? " tall" : "";
  return `<div class="item${tall}">${parts.join("\n")}</div>`;
}

function renderNarrative(catalog: Catalog, rows: CatalogItem[], ctx: RenderCtx): string {
  const head = letterheadHtml(catalog.letterhead_snapshot);
  const title = `<div class="doc-title doc-title-center">${esc(
    catalog.title || "แคตตาล็อก",
  )}</div>`;
  const items = rows.map((item) => narrativeItem(item, ctx)).join("\n");

  // ห่อด้วยตาราง: `thead` ทำให้หัวจดหมาย **ซ้ำทุกหน้า** ใน Chromium (ท่าเดียวกับ mom-html)
  return (
    `<table class="frame">` +
    (head ? `<thead><tr><th>${head}</th></tr></thead>` : "") +
    `<tbody><tr><td>${title}${items}</td></tr></tbody>` +
    `</table>`
  );
}
