import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../_lib/module-auth';
import { createAdminClient } from '../_lib/supabase';
import { canModuleWrite } from '@/lib/modules';
import { setAuditContext } from '../_lib/audit';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  // 1. ยืนยันสิทธิ์สมาชิกองค์กรและสิทธิ์เข้าถึงโมดูล
  const auth = await requireModuleMember(req, orgId, 'b2g');
  if (!auth.ok) return auth.res;

  // 2. Query ข้อมูล (ใช้ createAdminClient เพื่อบายพาส RLS)
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('b2g_records')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    // ถ้าตารางยังไม่ได้สร้างจริงใน DB ให้ส่งอาร์เรย์ว่างไปก่อนเพื่อให้หน้าบ้านทำงานได้ไม่พัง
    if (error.code === 'P0001' || error.message.includes('does not exist')) {
      return NextResponse.json({ records: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ records: data ?? [] });
}

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  // 1. ยืนยันสิทธิ์เข้าใช้โมดูล
  const auth = await requireModuleMember(req, orgId, 'b2g');
  if (!auth.ok) return auth.res;

  // 2. เช็คสิทธิ์การเขียนข้อมูล
  if (!canModuleWrite('b2g', auth.moduleRole)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียนข้อมูลในโมดูลนี้' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { title } = body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'missing title' }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. กำหนด Audit Context ก่อนสั่งเขียนข้อมูลใน DB
  await setAuditContext(req, auth.userId, auth.orgId);

  // 4. บันทึกข้อมูล
  const { data, error } = await admin
    .from('b2g_records')
    .insert({
      org_id:     auth.orgId,
      created_by: auth.userId,
      title:      title.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ record: data }, { status: 201 });
}
