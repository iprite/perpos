/**
 * MoM (Minutes of Meeting) HTML template — render เป็น PDF ผ่าน pdf-renderer (Chromium)
 * ใช้ร่วมกันโดย: mom-pdf route (ดาวน์โหลดจากเว็บ) และ mom-deliver route (ส่งกลับ LINE)
 *
 * การแบ่งหน้า (page break) ระดับมืออาชีพ:
 *   ทุก section ถูกห่อด้วย <table> ที่มี <thead> เป็นหัวข้อ — Chromium จะ "ซ้ำ thead"
 *   ทุกหน้าที่ตารางนั้นพาดข้ามไป (display: table-header-group) ดังนั้นเมื่อเนื้อหา
 *   (รายการ/การ์ด/ตาราง Action Items) ถูกตัดข้ามหน้า หัวข้อจะตามไปขึ้นต้นหน้าใหม่เสมอ
 *   ส่วนตาราง Action Items มี thead 2 แถว (ชื่อหัวข้อ + หัวคอลัมน์) จึงซ้ำทั้งคู่
 */

export type MomKeyTopic = { topic?: string; details?: string };
export type MomActionItem = { task?: string; assignee?: string };
export type MomJson = {
  meeting_title?: string;
  executive_summary?: string;
  speakers?: string[];
  key_topics?: MomKeyTopic[];
  decisions?: string[];
  action_items?: MomActionItem[];
  recommendations?: string[];
};

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

export function buildMomHtml(tj: MomJson, dateText: string): string {
  const title = esc(tj.meeting_title || 'รายงานการประชุม');
  const speakers = (tj.speakers ?? []).map(esc);
  const summary = esc(tj.executive_summary || '');

  const topics = (tj.key_topics ?? [])
    .map((k) => `<li><span class="t">${esc(k.topic)}</span>${k.details ? `<div class="d">${esc(k.details)}</div>` : ''}</li>`)
    .join('');

  const decisions = (tj.decisions ?? []).map((d) => `<li>${esc(d)}</li>`).join('');
  const recommendations = (tj.recommendations ?? []).map((r) => `<li>${esc(r)}</li>`).join('');

  const actions = (tj.action_items ?? []).length
    ? (tj.action_items ?? [])
        .map(
          (a, i) =>
            `<tr><td class="cno">${i + 1}</td><td>${esc(a.task)}</td><td class="cwho">${esc(a.assignee && a.assignee !== 'ไม่ระบุ' ? a.assignee : '—')}</td></tr>`,
        )
        .join('')
    : `<tr><td class="empty" colspan="3">— ไม่มีรายการที่ต้องดำเนินการ —</td></tr>`;

  // ตาราง Action Items — thead 2 แถว (ชื่อหัวข้อ + หัวคอลัมน์) ซ้ำทุกหน้าเมื่อตารางยาวข้ามหน้า
  const actionTable =
    `<table class="ai"><thead>` +
    `<tr><th class="aih" colspan="3">ตารางสรุปสิ่งที่ต้องดำเนินการ (Action Items)</th></tr>` +
    `<tr><th class="cno">#</th><th>สิ่งที่ต้องดำเนินการ</th><th class="cwho">ผู้รับผิดชอบ</th></tr>` +
    `</thead><tbody>${actions}</tbody></table>`;

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
</style></head><body>
  <div class="brandrow"><span class="brand">PERPOS</span><span>รายงานการประชุม · Minutes of Meeting</span></div>
  <div class="accent"></div>

  <div class="title">${title}</div>

  <div class="meta">
    <div class="r"><span class="l">วันที่จัดทำ</span><span>${esc(dateText)}</span></div>
    <div class="r"><span class="l">ผู้เข้าร่วม</span><span>${speakers.length ? `${speakers.length} คน — ${speakers.join(', ')}` : '—'}</span></div>
  </div>

  ${summary ? section('บทสรุปการประชุม', `<div class="summary">${summary}</div>`) : ''}

  ${topics ? section('ประเด็นในที่ประชุม', `<ol class="topics">${topics}</ol>`) : ''}

  ${decisions ? section('มติ / ข้อสรุปที่ประชุม', `<ul class="dec">${decisions}</ul>`) : ''}

  ${actionTable}

  ${recommendations ? section('ข้อเสนอแนะ', `<div class="rec"><ul class="rec-list">${recommendations}</ul></div>`) : ''}
</body></html>`;
}
