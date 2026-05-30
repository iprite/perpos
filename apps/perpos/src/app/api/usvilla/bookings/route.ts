import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../_lib/module-auth';
import { createAdminClient } from '../../_lib/supabase';
import { setAuditContext } from '../../_lib/audit';
import { canModuleWrite } from '@/lib/modules';

// GET /api/usvilla/bookings?orgId=xxx&date=2026-05-29
// GET /api/usvilla/bookings?orgId=xxx&from=2026-05-25&to=2026-06-07   (calendar range)
// GET /api/usvilla/bookings?orgId=xxx&mode=active                      (all checked-in)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const orgId = searchParams.get('orgId');
  const date  = searchParams.get('date');
  const from  = searchParams.get('from');
  const to    = searchParams.get('to');
  const mode  = searchParams.get('mode');

  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'usvilla');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  let query = admin
    .from('pms_bookings')
    .select(`
      id, guest_name, nationality, stay_type,
      check_in_date, check_in_time, check_out_date, check_out_time,
      nights, status, notes, created_at,
      pms_rooms!inner(id, room_number, room_type),
      pms_payments(id, method, amount, paid_at)
    `)
    .eq('org_id', orgId);

  if (from && to) {
    // Calendar range: bookings that overlap [from, to]
    query = query
      .lte('check_in_date', to)
      .not('status', 'in', '("cancelled")')
      .or(`check_out_date.is.null,check_out_date.gte.${from}`);
  } else if (mode === 'active') {
    query = query.in('status', ['checked_in', 'reserved']);
  } else if (date) {
    const d = date;
    query = query.or(
      `check_in_date.eq.${d},and(status.in.(checked_in,reserved),check_out_date.gte.${d}),and(status.in.(checked_in,reserved),check_out_date.is.null)`
    );
  } else {
    query = query.in('status', ['checked_in', 'reserved']);
  }

  const { data, error } = await query.order('check_in_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ bookings: data ?? [] });
}

// POST /api/usvilla/bookings?orgId=xxx
export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'usvilla');
  if (!auth.ok) return auth.res;

  if (!canModuleWrite('usvilla', auth.moduleRole)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียนข้อมูล' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    room_id, guest_name, nationality, stay_type,
    check_in_date, check_in_time, check_out_date, check_out_time,
    nights, notes, payments = [],
  } = body;

  if (!room_id || !guest_name?.trim() || !check_in_date) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ (room_id, guest_name, check_in_date)' }, { status: 400 });
  }

  const admin = createAdminClient();

  // ตรวจสอบว่าห้องนี้ไม่มีการเข้าพักซ้ำ
  const { count } = await admin
    .from('pms_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', room_id)
    .in('status', ['checked_in', 'reserved'])
    .lte('check_in_date', check_in_date)
    .or(`check_out_date.is.null,check_out_date.gte.${check_in_date}`);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'ห้องนี้มีแขกเข้าพักอยู่แล้วในช่วงเวลาดังกล่าว' }, { status: 409 });
  }

  await setAuditContext(req, auth.userId, auth.orgId);

  const { data: booking, error: bookingErr } = await admin
    .from('pms_bookings')
    .insert({
      org_id: orgId,
      room_id,
      guest_name: guest_name.trim(),
      nationality: nationality?.trim() || null,
      stay_type: stay_type || 'daily',
      check_in_date,
      check_in_time: check_in_time || null,
      check_out_date: check_out_date || null,
      check_out_time: check_out_time || null,
      nights: nights ? Number(nights) : null,
      status: 'checked_in',
      notes: notes?.trim() || null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });

  // บันทึก payments (ถ้ามี)
  const validPayments = (payments as { method: string; amount: number }[]).filter(
    (p) => p.method && Number(p.amount) > 0
  );

  if (validPayments.length > 0) {
    const { error: payErr } = await admin.from('pms_payments').insert(
      validPayments.map((p) => ({
        org_id:     orgId,
        booking_id: booking.id,
        method:     p.method,
        amount:     Number(p.amount),
      }))
    );
    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });
  }

  return NextResponse.json({ booking }, { status: 201 });
}
