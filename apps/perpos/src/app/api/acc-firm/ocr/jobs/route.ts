/**
 * API Route Handler: /api/acc-firm/ocr/jobs
 *
 * GET  /api/acc-firm/ocr/jobs?orgId=<firmOrgId>&jobId=<jobId>
 * GET  /api/acc-firm/ocr/jobs?orgId=<firmOrgId>&clientOrgId=<clientOrgId>
 *   — ดึงข้อมูลประวัติหรือสถานะของงานประมวลผล OCR
 *
 * POST /api/acc-firm/ocr/jobs
 *   — ลงทะเบียนงานประมวลผล OCR ใบใหม่
 *   body: { firmOrgId, clientOrgId, documentUrl }
 */

import { NextRequest } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, created, Err } from '../../../_lib/response';

// ── GET: ดึงข้อมูลสถานะหรือรายการ OCR Jobs ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get('orgId');
  if (!firmOrgId) return Err.missingField('orgId');

  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  const jobId = req.nextUrl.searchParams.get('jobId');
  const clientOrgId = req.nextUrl.searchParams.get('clientOrgId');
  const limitStr = req.nextUrl.searchParams.get('limit') || '20';
  const limit = parseInt(limitStr, 10);

  const admin = createAdminClient();

  // 1. กรณีระบุ jobId: ดึงข้อมูลงานเดี่ยว
  if (jobId) {
    const { data: job, error } = await admin
      .from('ocr_processing_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('firm_org_id', firmOrgId)
      .maybeSingle();

    if (error) return Err.dbError(error);
    if (!job) return Err.notFound(`OCR Job ID ${jobId}`);

    return ok(job);
  }

  // 2. กรณีค้นหาตามรายการ: ดึงประวัติรายการงาน
  let query = admin
    .from('ocr_processing_jobs')
    .select('*')
    .eq('firm_org_id', firmOrgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (clientOrgId) {
    query = query.eq('client_org_id', clientOrgId);
  }

  const { data: jobs, error } = await query;
  if (error) return Err.dbError(error);

  return ok(jobs || []);
}

// ── POST: สร้างงานประมวลผล OCR ใบใหม่ ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { firmOrgId, clientOrgId, documentUrl } = body ?? {};

  if (!firmOrgId) return Err.missingField('firmOrgId');
  if (!clientOrgId) return Err.missingField('clientOrgId');
  if (!documentUrl) return Err.missingField('documentUrl');

  // ตรวจสอบสิทธิ์ผู้ใช้งานเป็นพนักงานในสำนักงานบัญชีหรือไม่
  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  // เสมียนระดับ viewer ไม่ได้อนุญาตให้เพิ่มข้อมูลงาน
  if (auth.moduleRole === 'viewer') {
    return Err.forbidden('ไม่มีสิทธิ์เพิ่มรายการประมวลผล OCR');
  }

  const admin = createAdminClient();

  // ตรวจสอบความสัมพันธ์ว่า client_org_id นี้เป็นลูกค้าของสำนักงานบัญชีจริงหรือไม่
  const { data: clientRelation, error: relationError } = await admin
    .from('acc_firm_clients')
    .select('id, status')
    .eq('firm_org_id', firmOrgId)
    .eq('client_org_id', clientOrgId)
    .maybeSingle();

  if (relationError) return Err.dbError(relationError);
  if (!clientRelation || clientRelation.status !== 'active') {
    return Err.forbidden('ความสัมพันธ์ลูกค้าไม่อยู่ในสถานะที่ใช้งานได้');
  }

  // ── ป้องกันการอ้างอิงไฟล์ข้ามองค์กร (cross-tenant) ──
  // documentUrl ต้องเป็น storage path ภายใต้โฟลเดอร์ของลูกค้ารายนี้ (`<clientOrgId>/...`)
  const storagePath = String(documentUrl).includes('/client_documents/')
    ? String(documentUrl).split('/client_documents/')[1].split('?')[0]
    : String(documentUrl).split('?')[0];

  if (!storagePath.startsWith(`${clientOrgId}/`)) {
    return Err.invalidFormat('documentUrl', 'เส้นทางไฟล์ต้องอยู่ภายใต้โฟลเดอร์ขององค์กรลูกค้า');
  }

  // ดึงอีเมลผู้สั่งงานไว้ใช้ระบุตัวตนใน audit log จากฝั่ง Cloud Run worker
  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', auth.userId)
    .maybeSingle();

  // บันทึกสร้างงานประมวลผลลงคิวฐานข้อมูล
  const { data: job, error } = await admin
    .from('ocr_processing_jobs')
    .insert({
      firm_org_id:        firmOrgId,
      client_org_id:      clientOrgId,
      document_url:       storagePath,
      status:             'pending',
      triggered_by:       auth.userId,
      triggered_by_email: profile?.email ?? null,
    })
    .select('*')
    .single();

  if (error) return Err.dbError(error);

  return created(job);
}
