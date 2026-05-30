import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { setAuditContext } from '../../../_lib/audit';
import { canModuleWrite } from '@/lib/modules';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/usvilla/bookings/[id]?orgId=xxx
// action: checkout | cancel | update
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'usvilla');
  if (!auth.ok) return auth.res;

  if (!canModuleWrite('usvilla', auth.moduleRole)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูล' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { action, check_out_date, check_out_time, notes, payments = [] } = body;

  const admin = createAdminClient();

  // ตรวจสอบว่า booking นี้เป็นของ org
  const { data: existing } = await admin
    .from('pms_bookings')
    .select('id, status, org_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (!existing) return NextResponse.json({ error: 'ไม่พบข้อมูลการเข้าพัก' }, { status: 404 });

  await setAuditContext(req, auth.userId, auth.orgId);

  if (action === 'checkout') {
    if (existing.status === 'checked_out') {
      return NextResponse.json({ error: 'เช็คเอาท์ไปแล้ว' }, { status: 400 });
    }

    const now = new Date();
    const outDate = check_out_date || now.toISOString().slice(0, 10);
    const outTime = check_out_time || now.toTimeString().slice(0, 5);

    const { error } = await admin
      .from('pms_bookings')
      .update({
        status: 'checked_out',
        check_out_date: outDate,
        check_out_time: outTime,
        updated_at: now.toISOString(),
      })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // บันทึก payment เพิ่มเติม (ถ้ามี)
    const validPayments = (payments as { method: string; amount: number }[]).filter(
      (p) => p.method && Number(p.amount) > 0
    );
    if (validPayments.length > 0) {
      await admin.from('pms_payments').insert(
        validPayments.map((p) => ({
          org_id:     orgId,
          booking_id: id,
          method:     p.method,
          amount:     Number(p.amount),
        }))
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === 'cancel') {
    if (existing.status === 'checked_out') {
      return NextResponse.json({ error: 'เช็คเอาท์ไปแล้ว ไม่สามารถยกเลิกได้' }, { status: 400 });
    }
    const { error } = await admin
      .from('pms_bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'add_payment') {
    const { method, amount } = body;
    if (!method || !Number(amount) || Number(amount) <= 0) {
      return NextResponse.json({ error: 'กรุณาระบุช่องทางและจำนวนเงิน' }, { status: 400 });
    }
    const { error } = await admin.from('pms_payments').insert({
      org_id:     orgId,
      booking_id: id,
      method,
      amount:     Number(amount),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // action === 'update'
  const { error } = await admin
    .from('pms_bookings')
    .update({ notes: notes?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
