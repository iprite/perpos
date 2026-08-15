/**
 * ด่านความปลอดภัยของ HTML เมล (spec §7.1–§7.4, §7.11)
 *
 * เครดิต (MIT): แนวคิดและคอนฟิกบางส่วนอ้างอิงจาก Mail-0/Zero (https://github.com/Mail-0/Zero)
 * — config ของ sanitize-html, การยุบ quoted text ด้วย <details>, selector ของ Gmail/Outlook,
 *   การตัด tracking pixel/preheader และการแปลง cid: เป็น data:
 *   **ไม่ได้คัดลอกโค้ดมาตรง ๆ** เขียนใหม่ทั้งหมดให้เข้ากับ contract นี้ (ชั้น iframe/CSP ต่างกันโดยสิ้นเชิง)
 *
 * ลำดับการประมวลผลห้ามสลับ:  sanitize-html (ความปลอดภัย) → cheerio (โครงสร้าง) → ประกอบ srcdoc + CSP
 * ทั้งหมดทำ **ฝั่ง server เท่านั้น** — ห้าม sanitize ที่ client และห้ามส่ง HTML ดิบข้าม API
 */

import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";

import { INLINE_IMAGE_TYPES } from "./jmap";

// ─── iframe + CSP — ค่าคงที่อยู่ที่ lib/mail/srcdoc.ts (ไฟล์ที่ไม่มี dependency)
// re-export ไว้ที่นี่เพื่อความเข้ากันได้ · client component ให้ import จาก srcdoc.ts ตรง ๆ
export { MAIL_IFRAME_SANDBOX, buildMailSrcdoc, mailCsp } from "./srcdoc";

// ─── ชั้นที่ 1: sanitize-html ────────────────────────────────────────────────

const SAFE_CSS_VALUE = new RegExp(
  "^(?!.*(?:url|expression|import|javascript|behavior|@))[a-zA-Z0-9#%,.()/ _-]+$",
  "i",
);

const CSS_PROPERTIES = [
  "color",
  "background-color",
  "font",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "text-align",
  "text-decoration",
  "text-transform",
  "text-indent",
  "line-height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "border-collapse",
  "border-spacing",
  "width",
  "height",
  "max-width",
  "min-width",
  "display",
  "vertical-align",
] as const;

const ALLOWED_STYLES: Record<string, RegExp[]> = Object.fromEntries(
  CSS_PROPERTIES.map((p) => [p, [SAFE_CSS_VALUE]]),
);

export const MAIL_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "td",
    "th",
    "caption",
    "colgroup",
    "col",
    "details",
    "summary",
    "span",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "pre",
    "code",
    "blockquote",
    "hr",
  ],
  allowedAttributes: {
    // ⚠️ ขาดกลุ่ม attribute ยุค HTML4 นี้ = เมล newsletter/การตลาดพังทั้งหมด
    "*": [
      "cellpadding",
      "cellspacing",
      "colspan",
      "rowspan",
      "bgcolor",
      "valign",
      "align",
      "border",
      "width",
      "height",
      "style",
      "class",
      "dir",
      "title",
    ],
    a: ["href", "name", "target", "rel"],
    // ⚠️ ต้องเก็บ id ของ div ไว้ ไม่งั้น selector `div#divRplyFwdMsg` (Outlook) ใน §7.11
    // จับไม่ได้เลย เพราะชั้นโครงสร้างทำงาน "หลัง" sanitize
    div: ["id"],
    img: ["src", "alt", "width", "height", "style"],
    details: ["class", "open"],
    summary: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https", "cid", "data"],
    a: ["http", "https", "mailto"],
  },
  allowedStyles: { "*": ALLOWED_STYLES },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
    }),
  },
  disallowedTagsMode: "discard",
  allowProtocolRelative: false,
  enforceHtmlBoundary: true,
};

/** ตัวบ่งชี้ "มีของที่จะไปโหลดจากภายนอก" — ตรวจจาก HTML ดิบก่อนถูก strip */
export function detectRemoteImages(rawHtml: string): boolean {
  const lower = rawHtml.toLowerCase();
  const markers = [
    "url(",
    "<link",
    "@import",
    "poster=",
    "xlink:href",
    "background=",
    "srcset=",
    'http-equiv="refresh"',
    'src="http',
    "src='http",
    "src=http",
  ];
  return markers.some((m) => lower.includes(m));
}

export function sanitizeMailHtml(rawHtml: string): { html: string; hasRemoteImages: boolean } {
  const hasRemoteImages = detectRemoteImages(rawHtml);
  return { html: sanitizeHtml(rawHtml, MAIL_SANITIZE_OPTIONS), hasRemoteImages };
}

// ─── ชั้นที่ 2: โครงสร้าง (cheerio) ──────────────────────────────────────────

/** เพดานรวมของ body + รูป inline ต่อ 1 ข้อความ (นับ byte ของสตริง data: หลัง base64) */
export const INLINE_BUDGET_BYTES = 5 * 1024 * 1024;

export interface InlineImageSource {
  cid: string;
  type: string;
  base64: string;
}

/**
 * ด่าน MIME อยู่ตรงนี้ ไม่ใช่ที่ sanitizer — ประกอบ data: เฉพาะ 4 ชนิดรูปที่อนุญาต
 * (โดยเฉพาะ image/svg+xml ต้องไม่ถูกแปลง → คง cid: ไว้ให้ CSP บล็อกแล้วโชว์เป็นไฟล์แนบ)
 */
export function buildInlineImageMap(
  sources: InlineImageSource[],
  budgetBytes = INLINE_BUDGET_BYTES,
): Record<string, string> {
  const map: Record<string, string> = {};
  let used = 0;
  for (const src of sources) {
    const type = (src.type ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!(INLINE_IMAGE_TYPES as readonly string[]).includes(type)) continue;
    if (!src.cid) continue;
    const dataUrl = `data:${type};base64,${src.base64}`;
    if (used + dataUrl.length > budgetBytes) continue;
    used += dataUrl.length;
    map[src.cid] = dataUrl;
  }
  return map;
}

const QUOTE_SELECTOR = [
  "blockquote",
  ".gmail_quote",
  ".gmail_extra",
  "div#divRplyFwdMsg",
  'blockquote[type="cite"]',
].join(",");

function pxOf(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function styleValue(style: string | undefined, prop: string): string | null {
  if (!style) return null;
  for (const chunk of style.split(";")) {
    const idx = chunk.indexOf(":");
    if (idx === -1) continue;
    if (chunk.slice(0, idx).trim().toLowerCase() === prop) {
      return chunk
        .slice(idx + 1)
        .trim()
        .toLowerCase();
    }
  }
  return null;
}

export interface RestructureResult {
  html: string;
  hasRemoteImages: boolean;
}

/**
 * ชั้นโครงสร้าง — ทำงานบน HTML ที่ผ่าน sanitize แล้ว จึงเพิ่มได้เฉพาะแท็กใน allowlist
 * (details/summary) ไม่มีทางนำของอันตรายกลับเข้ามา
 */
export function restructureMailHtml(
  safeHtml: string,
  opts: { inlineImages?: Record<string, string>; stripRemoteImages?: boolean } = {},
): RestructureResult {
  const $ = cheerio.load(safeHtml);
  const inline = opts.inlineImages ?? {};

  // 1) unwrap details/summary ที่มาจากผู้ส่ง — คงเนื้อใน ทิ้งเปลือก
  //    (ไม่งั้นผู้ส่งแนบ <details class="quoted-toggle"> มาเองเพื่อให้เนื้อหาจริงถูกยุบซ่อน)
  $("summary").remove();
  $("details").each((_, el) => {
    const node = $(el);
    node.replaceWith(node.html() ?? "");
  });

  // 2) tracking pixel — img ที่กว้าง/สูง <= 1 (ทั้ง attribute และ style)
  $("img").each((_, el) => {
    const node = $(el);
    const style = node.attr("style");
    const w = pxOf(node.attr("width")) ?? pxOf(styleValue(style, "width") ?? undefined);
    const h = pxOf(node.attr("height")) ?? pxOf(styleValue(style, "height") ?? undefined);
    if (w !== null && h !== null && w <= 1 && h <= 1) node.remove();
  });

  // 3) preheader / element ที่ซ่อนไว้ (ไม่งั้นไปโผล่ใน preview ของแถวรายการ)
  $("[style]").each((_, el) => {
    const node = $(el);
    const style = node.attr("style") ?? "";
    const display = styleValue(style, "display");
    const fontSize = styleValue(style, "font-size");
    const opacity = styleValue(style, "opacity");
    const msoHide = styleValue(style, "mso-hide");
    const hidden =
      display === "none" ||
      opacity === "0" ||
      msoHide === "all" ||
      (fontSize !== null && (pxOf(fontSize) ?? 1) === 0);
    if (hidden) node.remove();
  });

  // 4) cid: → data: (เฉพาะที่ผ่านด่าน MIME + งบ byte มาแล้วใน buildInlineImageMap)
  $("img").each((_, el) => {
    const node = $(el);
    const src = node.attr("src") ?? "";
    if (!src.toLowerCase().startsWith("cid:")) return;
    const cid = src.slice(4).replace(/^</, "").replace(/>$/, "");
    const dataUrl = inline[cid];
    if (dataUrl) node.attr("src", dataUrl);
  });

  // 5) ยุบข้อความที่อ้างถึงเป็น <details> (native — ไม่ต้องใช้ JS ใน iframe)
  $(QUOTE_SELECTOR).each((_, el) => {
    const node = $(el);
    if (node.closest("details.quoted-toggle").length > 0) return;
    node.wrap('<details class="quoted-toggle"></details>');
    node.parent().prepend("<summary>แสดงข้อความที่อ้างถึง</summary>");
  });

  // 6) รูปนอก — DOM strip เป็น "ชั้นรอง" (ด่านจริงคือ CSP ใน srcdoc)
  let remote = false;
  $("img").each((_, el) => {
    const node = $(el);
    const src = (node.attr("src") ?? "").toLowerCase();
    if (src.startsWith("http://") || src.startsWith("https://")) {
      remote = true;
      if (opts.stripRemoteImages) node.removeAttr("src");
    }
  });

  return { html: $("body").html() ?? "", hasRemoteImages: remote };
}

/** ท่อเต็ม: sanitize → restructure (ใช้ใน route handler เท่านั้น) */
export function prepareMailHtml(
  rawHtml: string,
  opts: { inlineImages?: Record<string, string>; stripRemoteImages?: boolean } = {},
): RestructureResult {
  const stage1 = sanitizeMailHtml(rawHtml);
  const stage2 = restructureMailHtml(stage1.html, opts);
  return {
    html: stage2.html,
    hasRemoteImages: stage1.hasRemoteImages || stage2.hasRemoteImages,
  };
}
