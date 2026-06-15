/**
 * POST /api/assistant/transcribe/mom-pdf
 *   body: { orgId, jobId }
 *   — สร้างรายงานการประชุม (Minutes of Meeting) เป็น PDF ผ่าน pdf-renderer (Chromium)
 *     เพื่อให้ภาษาไทย shaping ถูกต้อง (สระล่าง/ตัวสะกดไม่ตกหล่นแบบ @react-pdf)
 */

import { NextRequest } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { Err } from '../../../_lib/response';

type KeyTopic = { topic?: string; details?: string };
type ActionItem = { task?: string; assignee?: string };
type MomJson = {
  meeting_title?: string;
  executive_summary?: string;
  speakers?: string[];
  key_topics?: KeyTopic[];
  decisions?: string[];
  action_items?: ActionItem[];
};

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { orgId, jobId } = body ?? {};
  if (!orgId) return Err.missingField('orgId');
  if (!jobId) return Err.missingField('jobId');

  const auth = await requireModuleMember(req, orgId, 'assistant');
  if (!auth.ok) return auth.res;

  const renderUrl = process.env.PDF_RENDER_URL;
  const renderSecret = process.env.PDF_SERVICE_SECRET;
  if (!renderUrl) return Err.externalService('PDF renderer', 'ยังไม่ได้ตั้งค่า PDF_RENDER_URL');

  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from('transcription_jobs')
    .select('file_name, status, transcript_json, created_at')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) return Err.dbError(error);
  if (!job) return Err.notFound(`Transcription job ${jobId}`);
  if (job.status !== 'completed' || !job.transcript_json) {
    return Err.invalidFormat('jobId', 'งานนี้ยังไม่มีผลสรุปให้สร้าง PDF');
  }

  const tj = job.transcript_json as MomJson;
  const dateText = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(job.created_at as string));

  const html = buildMomHtml(tj, dateText);
  const filename = `MoM-${(tj.meeting_title || job.file_name || 'meeting').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60) || 'meeting'}`;

  const resp = await fetch(`${renderUrl.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(renderSecret ? { 'x-pdf-secret': renderSecret } : {}),
    },
    body: JSON.stringify({ html, filename }),
  }).catch((e) => {
    throw e;
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return Err.externalService('PDF renderer', `${resp.status} ${detail}`.slice(0, 300));
  }

  const pdf = await resp.arrayBuffer();
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ── HTML template (รายงานการประชุมแบบเลขามืออาชีพ) ─────────────────────────────
function buildMomHtml(tj: MomJson, dateText: string): string {
  const title = esc(tj.meeting_title || 'รายงานการประชุม');
  const speakers = (tj.speakers ?? []).map(esc);
  const summary = esc(tj.executive_summary || '');

  const topics = (tj.key_topics ?? [])
    .map((k) => `<li><span class="t">${esc(k.topic)}</span>${k.details ? `<div class="d">${esc(k.details)}</div>` : ''}</li>`)
    .join('');

  const decisions = (tj.decisions ?? []).map((d) => `<li>${esc(d)}</li>`).join('');

  const actions = (tj.action_items ?? []).length
    ? (tj.action_items ?? [])
        .map(
          (a, i) =>
            `<tr><td class="cno">${i + 1}</td><td>${esc(a.task)}</td><td class="cwho">${esc(a.assignee && a.assignee !== 'ไม่ระบุ' ? a.assignee : '—')}</td></tr>`,
        )
        .join('')
    : `<tr><td class="empty" colspan="3">— ไม่มีรายการที่ต้องดำเนินการ —</td></tr>`;

  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 16mm 15mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Noto Sans Thai', sans-serif; color: #1f2937; font-size: 11px; font-weight: 400; line-height: 1.65; }
  .brandrow { display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #6b7280; }
  .brand { color: #0284c7; font-weight: 600; letter-spacing: 1.5px; }
  .accent { height: 3px; background: #0284c7; border-radius: 2px; margin: 6px 0 0; }
  .title { font-size: 19px; font-weight: 600; margin: 24px 0 14px; line-height: 1.35; }
  .meta { border: 1px solid #e5e7eb; background: #f9fafb; border-radius: 8px; padding: 12px 14px; margin-bottom: 22px; }
  .meta .r { display: flex; margin: 1px 0; }
  .meta .l { color: #6b7280; width: 70px; flex: none; }
  h2 { font-size: 13px; font-weight: 600; color: #0284c7; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
  section { margin-bottom: 18px; }
  .summary { border: 1px solid #bae6fd; background: #f0f9ff; border-radius: 8px; padding: 12px 14px; }
  ol.topics { margin: 0; padding-left: 20px; }
  ol.topics li { margin-bottom: 8px; }
  ol.topics .t { font-weight: 500; }
  ol.topics .d { color: #374151; font-weight: 400; }
  ul.dec { margin: 0; padding-left: 20px; }
  ul.dec li { margin-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #e5e7eb; padding: 7px 9px; text-align: left; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  thead { display: table-header-group; }
  thead th { background: #0284c7; color: #ffffff; font-weight: 600; font-size: 10.5px; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tr { break-inside: avoid; }
  .cno { width: 34px; text-align: center; }
  .cwho { width: 130px; }
  .empty { text-align: center; color: #6b7280; }
  .foot { position: fixed; bottom: 6mm; left: 0; right: 0; text-align: center; color: #9ca3af; font-size: 8px; }
</style></head><body>
  <div class="brandrow"><span class="brand">PERPOS</span><span>รายงานการประชุม · Minutes of Meeting</span></div>
  <div class="accent"></div>

  <div class="title">${title}</div>

  <div class="meta">
    <div class="r"><span class="l">วันที่จัดทำ</span><span>${esc(dateText)}</span></div>
    <div class="r"><span class="l">ผู้เข้าร่วม</span><span>${speakers.length ? `${speakers.length} คน — ${speakers.join(', ')}` : '—'}</span></div>
  </div>

  ${summary ? `<section><h2>บทสรุปผู้บริหาร</h2><div class="summary">${summary}</div></section>` : ''}

  ${topics ? `<section><h2>ประเด็นที่หารือ</h2><ol class="topics">${topics}</ol></section>` : ''}

  ${decisions ? `<section><h2>มติ / ข้อสรุปที่ประชุม</h2><ul class="dec">${decisions}</ul></section>` : ''}

  <section>
    <h2>ตารางสรุปสิ่งที่ต้องดำเนินการ (Action Items)</h2>
    <table>
      <thead><tr><th class="cno">#</th><th>สิ่งที่ต้องดำเนินการ</th><th class="cwho">ผู้รับผิดชอบ</th></tr></thead>
      <tbody>${actions}</tbody>
    </table>
  </section>

  <div class="foot">จัดทำโดยระบบ PERPOS Assistant</div>
</body></html>`;
}
