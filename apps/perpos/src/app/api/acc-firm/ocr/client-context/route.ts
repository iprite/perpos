import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { getClientContext } from '../../../../../lib/ai/gemini';
import { ok, Err } from '../../../_lib/response';

export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get('firmOrgId');
  const clientOrgId = req.nextUrl.searchParams.get('clientOrgId');

  if (!firmOrgId) return Err.missingField('firmOrgId');
  if (!clientOrgId) return Err.missingField('clientOrgId');

  // ตรวจสอบสิทธิ์ผู้ใช้งานเป็นพนักงานในสำนักงานบัญชี
  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // ตรวจสอบความสัมพันธ์ว่า clientOrgId เป็นลูกค้าของ firmOrgId จริงและใช้งานอยู่
  const { data: relation, error: relError } = await admin
    .from('acc_firm_clients')
    .select('id, status')
    .eq('firm_org_id', firmOrgId)
    .eq('client_org_id', clientOrgId)
    .maybeSingle();

  if (relError) return Err.dbError(relError);
  if (!relation || relation.status !== 'active') {
    return Err.forbidden('ไม่มีสิทธิ์เข้าถึงข้อมูลของลูกค้ารายนี้');
  }

  try {
    const context = await getClientContext(firmOrgId, clientOrgId);
    return ok(context);
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: { code: 'ERR_CONTEXT_LOAD_FAILED', message: err.message }
    }, { status: 500 });
  }
}

