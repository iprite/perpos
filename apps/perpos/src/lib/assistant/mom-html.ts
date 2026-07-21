/**
 * MoM (Minutes of Meeting) HTML template — render เป็น PDF ผ่าน pdf-renderer (Chromium)
 * ใช้ร่วมกันโดย: mom-pdf route (ดาวน์โหลดจากเว็บ) และ mom-deliver route (ส่งกลับ LINE)
 *
 * การแบ่งหน้า (page break):
 *   - section ข้อความ (สรุป/ประเด็น/มติ/ข้อเสนอแนะ) = ก้อนเดียว (break-inside: avoid)
 *     ถ้าเนื้อที่หน้าปัจจุบันไม่พอ → ยกทั้ง section ไปขึ้นหน้าใหม่ (ไม่ตัดครึ่ง/หัวข้อไม่ซ้ำ)
 *     เฉพาะ section ที่ยาวเกิน 1 หน้าจริง ๆ จึงถูกบังคับตัด แล้ว thead จะ repeat เป็น fallback
 *   - ตาราง Action Items = ยาวข้ามหน้าได้ตามปกติ + หัวข้อ/หัวคอลัมน์ (thead) ซ้ำทุกหน้า
 */

export type MomKeyTopic = { topic?: string; details?: string };
export type MomActionItem = { task?: string; assignee?: string };
// เนื้อรายงาน 1 ภาษา
export type MomBody = {
  meeting_title?: string;
  executive_summary?: string;
  key_topics?: MomKeyTopic[];
  decisions?: string[];
  action_items?: MomActionItem[];
  recommendations?: string[];
};
export type MomJson = MomBody & {
  speakers?: string[];
  language?: string;
  // ฉบับภาษาต้นทาง — มีเฉพาะเมื่อเสียงไม่ใช่ไทย (ฟิลด์หลักด้านบนเป็นไทยเสมอ)
  source?: (MomBody & { language?: string }) | null;
};

// ป้ายหัวข้อ/ป้ายกำกับตามภาษา (ฉบับไทย vs ฉบับภาษาต้นทาง)
type MomLabels = {
  defaultTitle: string;
  summary: string;
  topics: string;
  decisions: string;
  actionTitle: string;
  colNo: string;
  colTask: string;
  colOwner: string;
  actionEmpty: string;
  recommendations: string;
};

const TH_LABELS: MomLabels = {
  defaultTitle: "รายงานการประชุม",
  summary: "บทสรุปการประชุม",
  topics: "ประเด็นในที่ประชุม",
  decisions: "มติ / ข้อสรุปที่ประชุม",
  actionTitle: "ตารางสรุปสิ่งที่ต้องดำเนินการ (Action Items)",
  colNo: "#",
  colTask: "สิ่งที่ต้องดำเนินการ",
  colOwner: "ผู้รับผิดชอบ",
  actionEmpty: "— ไม่มีรายการที่ต้องดำเนินการ —",
  recommendations: "ข้อเสนอแนะ",
};

const EN_LABELS: MomLabels = {
  defaultTitle: "Minutes of Meeting",
  summary: "Executive Summary",
  topics: "Discussion Topics",
  decisions: "Decisions",
  actionTitle: "Action Items",
  colNo: "#",
  colTask: "Action Item",
  colOwner: "Owner",
  actionEmpty: "— No action items —",
  recommendations: "Recommendations",
};

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Running footer — ส่งให้ pdf-renderer (Playwright displayHeaderFooter) เพื่อพิมพ์
 * ท้าย "ทุกหน้า" ใน margin ล่าง พร้อมเลขหน้า (มืออาชีพ ไม่หลุดไปโดดบนหน้าเปล่า)
 * NOTE: template นี้ไม่ inherit CSS ของ body — ต้อง inline style ทั้งหมด
 */
export const MOM_FOOTER_TEMPLATE =
  `<div style="width:100%; box-sizing:border-box; padding:0 15mm; font-family:'Noto Sans Thai','TLwg Typist',sans-serif; font-size:7px; color:#9ca3af; display:flex; justify-content:space-between; align-items:center;">` +
  `<span>จัดทำโดยระบบ PERPOS Assistant</span>` +
  `<span>หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span>` +
  `</div>`;

// ห่อ section ด้วยตารางหัวข้อซ้ำได้ — เมื่อเนื้อหาตัดข้ามหน้า หัวข้อจะ repeat ตามไปด้วย
const section = (heading: string, inner: string): string =>
  `<table class="sec"><thead><tr><th>${esc(heading)}</th></tr></thead>` +
  `<tbody><tr><td>${inner}</td></tr></tbody></table>`;

// สร้าง "เนื้อรายงาน 1 ภาษา" (title + meta + ทุก section) — ใช้ซ้ำกับฉบับไทยและฉบับภาษาต้นทาง
// metaHtml = กล่องวันที่/ผู้เข้าร่วม แทรกใต้ title (เฉพาะฉบับหลัก — ฉบับภาษาต้นทางไม่ทำซ้ำ)
function renderReportBody(body: MomBody, L: MomLabels, metaHtml = ""): string {
  const title = esc(body.meeting_title || L.defaultTitle);
  const summary = esc(body.executive_summary || "");

  const topics = (body.key_topics ?? [])
    .map(
      (k) =>
        `<li><span class="t">${esc(k.topic)}</span>${k.details ? `<div class="d">${esc(k.details)}</div>` : ""}</li>`,
    )
    .join("");

  const decisions = (body.decisions ?? []).map((d) => `<li>${esc(d)}</li>`).join("");
  const recommendations = (body.recommendations ?? []).map((r) => `<li>${esc(r)}</li>`).join("");

  const actions = (body.action_items ?? []).length
    ? (body.action_items ?? [])
        .map(
          (a, i) =>
            `<tr><td class="cno">${i + 1}</td><td>${esc(a.task)}</td><td class="cwho">${esc(a.assignee && a.assignee !== "ไม่ระบุ" && a.assignee !== "Unassigned" ? a.assignee : "—")}</td></tr>`,
        )
        .join("")
    : `<tr><td class="empty" colspan="3">${esc(L.actionEmpty)}</td></tr>`;

  // ตาราง Action Items — thead 2 แถว (ชื่อหัวข้อ + หัวคอลัมน์) ซ้ำทุกหน้าเมื่อตารางยาวข้ามหน้า
  const actionTable =
    `<table class="ai"><thead>` +
    `<tr><th class="aih" colspan="3">${esc(L.actionTitle)}</th></tr>` +
    `<tr><th class="cno">${esc(L.colNo)}</th><th>${esc(L.colTask)}</th><th class="cwho">${esc(L.colOwner)}</th></tr>` +
    `</thead><tbody>${actions}</tbody></table>`;

  return (
    `<div class="title">${title}</div>` +
    metaHtml +
    (summary ? section(L.summary, `<div class="summary">${summary}</div>`) : "") +
    (topics ? section(L.topics, `<ol class="topics">${topics}</ol>`) : "") +
    (decisions ? section(L.decisions, `<ul class="dec">${decisions}</ul>`) : "") +
    actionTable +
    (recommendations
      ? section(
          L.recommendations,
          `<div class="rec"><ul class="rec-list">${recommendations}</ul></div>`,
        )
      : "")
  );
}

export function buildMomHtml(tj: MomJson, dateText: string): string {
  const speakers = (tj.speakers ?? []).map(esc);

  // กล่องวันที่/ผู้เข้าร่วม — แสดงครั้งเดียวใต้ title ของฉบับหลัก
  const metaHtml =
    `<div class="meta">` +
    `<div class="r"><span class="l">วันที่จัดทำ</span><span>${esc(dateText)}</span></div>` +
    `<div class="r"><span class="l">ผู้เข้าร่วม</span><span>${speakers.length ? `${speakers.length} คน — ${speakers.join(", ")}` : "—"}</span></div>` +
    `</div>`;

  // ฉบับหลัก = ไทยเสมอ (ฟิลด์ระดับบน) · ถ้ามี source (เสียงไม่ใช่ไทย) → ต่อฉบับภาษาต้นทางในหน้าใหม่
  const thaiBody = renderReportBody(tj, TH_LABELS, metaHtml);
  const src = tj.source;
  const sourceLangTag = src?.language ? src.language.toUpperCase() : "";
  const sourceSection = src
    ? `<div class="pagebreak"></div>` +
      `<div class="langbanner">Original-language version${sourceLangTag ? ` · ${esc(sourceLangTag)}` : ""}</div>` +
      renderReportBody(src, EN_LABELS)
    : "";

  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 16mm 15mm 20mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Noto Sans Thai', sans-serif; color: #1f2937; font-size: 11px; font-weight: 400; line-height: 1.65; }
  .brandrow { display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #6b7280; }
  .brand { color: #0284c7; font-weight: 600; letter-spacing: 1.5px; }
  .accent { height: 3px; background: #0284c7; border-radius: 2px; margin: 6px 0 0; }
  .title { font-size: 19px; font-weight: 600; margin: 24px 0 14px; line-height: 1.35; break-after: avoid; }
  .meta { border: 1px solid #e5e7eb; background: #f9fafb; border-radius: 8px; padding: 12px 14px; margin-bottom: 22px; break-inside: avoid; }
  .meta .r { display: flex; margin: 1px 0; }
  .meta .l { color: #6b7280; width: 70px; flex: none; }

  /* ── Section ── */
  table.sec, table.ai { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  /* section ข้อความ = เป็นก้อนเดียว: ถ้าไม่พอในหน้า → ยกทั้ง section ไปขึ้นหน้าใหม่
     (break-inside: avoid). เฉพาะ section ที่ยาวเกิน 1 หน้าจริง ๆ จึงจะถูกบังคับตัด
     แล้ว thead จะ repeat เป็น fallback */
  table.sec { break-inside: avoid; }
  /* ตาราง Action Items = ข้อมูลที่ยาวข้ามหน้าได้ตามปกติ + หัวข้อ/หัวคอลัมน์ซ้ำทุกหน้า */
  table.ai { break-inside: auto; }
  table.sec > thead, table.ai > thead { display: table-header-group; }
  /* หัวข้อ section (thead) — สไตล์เดียวกับ h2 เดิม, ซ้ำทุกหน้า, ห้าม orphan */
  table.sec > thead > tr > th {
    text-align: left; font-size: 13px; font-weight: 600; color: #0284c7;
    padding: 0 0 4px; border: none; border-bottom: 1px solid #e5e7eb; break-after: avoid;
  }
  table.sec > tbody > tr > td { padding: 8px 0 0; border: none; vertical-align: top; }

  .summary { border: 1px solid #bae6fd; background: #f0f9ff; border-radius: 8px; padding: 12px 14px; break-inside: avoid; }
  ol.topics { margin: 0; padding-left: 20px; }
  ol.topics li { margin-bottom: 8px; break-inside: avoid; }
  ol.topics .t { font-weight: 500; }
  ol.topics .d { color: #374151; font-weight: 400; }
  ul.dec { margin: 0; padding-left: 20px; }
  ul.dec li { margin-bottom: 5px; break-inside: avoid; }
  .rec { border: 1px solid #e5e7eb; background: #fafafa; border-radius: 8px; padding: 6px 14px; }
  ul.rec-list { margin: 6px 0; padding-left: 20px; }
  ul.rec-list li { margin-bottom: 6px; break-inside: avoid; }

  /* ── ตาราง Action Items ── */
  table.ai { table-layout: fixed; }
  table.ai th, table.ai td { border: 1px solid #e5e7eb; padding: 7px 9px; text-align: left; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  /* แถวชื่อหัวข้อในตาราง — โปร่ง สไตล์เหมือนหัวข้อ section (ซ้ำทุกหน้า) */
  table.ai th.aih { background: transparent; color: #0284c7; font-size: 13px; font-weight: 600; border: none; border-bottom: 1px solid #e5e7eb; padding: 0 0 6px; }
  table.ai thead th:not(.aih) { background: #0284c7; color: #ffffff; font-weight: 600; font-size: 10.5px; }
  table.ai tbody tr:nth-child(even) { background: #f9fafb; }
  table.ai tbody tr { break-inside: avoid; }
  .cno { width: 34px; text-align: center; }
  .cwho { width: 130px; }
  .empty { text-align: center; color: #6b7280; }
  /* ขึ้นหน้าใหม่ก่อนฉบับภาษาต้นทาง */
  .pagebreak { break-before: page; }
  /* ป้ายคั่นฉบับภาษาต้นทาง */
  .langbanner { margin: 0 0 4px; font-size: 9px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #0284c7; }
</style></head><body>
  <div class="brandrow"><span class="brand">PERPOS</span><span>รายงานการประชุม · Minutes of Meeting</span></div>
  <div class="accent"></div>

  ${thaiBody}
  ${sourceSection}
</body></html>`;
}
