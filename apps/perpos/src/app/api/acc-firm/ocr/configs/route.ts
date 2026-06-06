/**
 * API Route Handler: /api/acc-firm/ocr/configs
 *
 * GET  /api/acc-firm/ocr/configs?orgId=<firmOrgId>&clientOrgId=<clientOrgId>
 *   — ดึงข้อมูลการตั้งค่าบริบททางบัญชีของลูกค้า
 *
 * POST /api/acc-firm/ocr/configs
 *   — อัปเดต/บันทึกการตั้งค่าบริบททางบัญชีของลูกค้า (Upsert)
 *   body: { firmOrgId, clientOrgId, vatRegistered, withholdingTaxRequired, accountingMethod, customPostingRules }
 */

import { NextRequest } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, created, Err } from '../../../_lib/response';

// ── GET: ดึงข้อมูลการตั้งค่าบริบทบัญชีของลูกค้า ──────────────────────────────────
export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get('orgId');
  const clientOrgId = req.nextUrl.searchParams.get('clientOrgId');

  if (!firmOrgId) return Err.missingField('orgId');
  if (!clientOrgId) return Err.missingField('clientOrgId');

  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // ดึงค่าการตั้งค่าจากตาราง acc_firm_client_configs
  const { data: config, error } = await admin
    .from('acc_firm_client_configs')
    .select('*')
    .eq('firm_org_id', firmOrgId)
    .eq('client_org_id', clientOrgId)
    .maybeSingle();

  if (error) return Err.dbError(error);

  // ถ้ายังไม่มีการบันทึกค่าไว้ ให้ส่งโครงสร้างค่าเริ่มต้นกลับไปให้
  if (!config) {
    return ok({
      firm_org_id: firmOrgId,
      client_org_id: clientOrgId,
      vat_registered: true,
      withholding_tax_required: true,
      accounting_method: 'accrual',
      custom_posting_rules: []
    });
  }

  return ok(config);
}

// ── POST: บันทึก/อัปเดตการตั้งค่าของลูกค้า (Upsert) ────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { 
    firmOrgId, 
    clientOrgId, 
    vatRegistered, 
    withholdingTaxRequired, 
    accountingMethod, 
    customPostingRules 
  } = body ?? {};

  if (!firmOrgId) return Err.missingField('firmOrgId');
  if (!clientOrgId) return Err.missingField('clientOrgId');

  // ตรวจสอบสิทธิ์ผู้ใช้งาน
  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  if (auth.moduleRole === 'viewer') {
    return Err.forbidden('ไม่มีสิทธิ์แก้ไขค่ากำหนดการบันทึกบัญชีของลูกค้า');
  }

  const admin = createAdminClient();

  // ตรวจสอบความสัมพันธ์ความเป็นลูกค้าก่อนอัปเดต
  const { data: clientRelation, error: relationError } = await admin
    .from('acc_firm_clients')
    .select('id')
    .eq('firm_org_id', firmOrgId)
    .eq('client_org_id', clientOrgId)
    .maybeSingle();

  if (relationError) return Err.dbError(relationError);
  if (!clientRelation) {
    return Err.forbidden('ไม่พบความสัมพันธ์การเป็นลูกค้าของสำนักงานบัญชีนี้');
  }

  // ทำการ Upsert ข้อมูลการตั้งค่า
  const { data: config, error } = await admin
    .from('acc_firm_client_configs')
    .upsert({
      firm_org_id:              firmOrgId,
      client_org_id:            clientOrgId,
      vat_registered:           vatRegistered !== undefined ? !!vatRegistered : true,
      withholding_tax_required: withholdingTaxRequired !== undefined ? !!withholdingTaxRequired : true,
      accounting_method:        accountingMethod || 'accrual',
      custom_posting_rules:     customPostingRules || [],
      created_by:               auth.userId,
      updated_at:               new Date().toISOString()
    }, {
      onConflict: 'firm_org_id,client_org_id'
    })
    .select('*')
    .single();

  if (error) return Err.dbError(error);

  return ok(config);
}
