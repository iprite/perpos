import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireTmcMember } from '../_lib';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const orgId = p.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  let q = auth.rls
    .from('tmc_stays')
    .select(`
      *,
      tmc_guests(id, first_name, last_name, nickname, tel, guest_type),
      tmc_properties(id, code, name)
    `)
    .eq('org_id', orgId)
    .order('check_in', { ascending: false });

  if (p.get('propertyCode')) q = q.eq('property_code', p.get('propertyCode')!);
  if (p.get('from')) q = q.gte('check_in', p.get('from')!);
  if (p.get('to')) q = q.lte('check_in', p.get('to')!);
  if (p.get('stayType')) q = q.eq('stay_type', p.get('stayType')!);
  if (p.get('bookingChannel')) q = q.eq('booking_channel', p.get('bookingChannel')!);

  const limit = Math.min(Number(p.get('limit') ?? 100), 500);
  const offset = Number(p.get('offset') ?? 0);
  q = q.range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const orgId = String(body.orgId ?? '');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // Resolve property_id
  const propertyCode = String(body.propertyCode ?? '');
  const { data: prop } = propertyCode
    ? await admin.from('tmc_properties').select('id').eq('org_id', orgId).eq('code', propertyCode).maybeSingle()
    : { data: null };

  // Upsert guest by tel/name if guestId not provided
  let guestId = body.guestId as string | null ?? null;
  if (!guestId && body.firstName) {
    const tel = String(body.tel ?? '');
    const { data: existing } = tel
      ? await admin.from('tmc_guests').select('id').eq('org_id', orgId).eq('tel', tel).maybeSingle()
      : { data: null };

    if (existing?.id) {
      guestId = existing.id;
    } else {
      const { data: newGuest } = await admin
        .from('tmc_guests')
        .insert({
          org_id: orgId,
          first_name: body.firstName,
          last_name: body.lastName ?? null,
          nickname: body.nickname ?? null,
          tel: tel || null,
          guest_type: body.stayType === 'influencer' ? 'influencer' : 'regular',
        })
        .select('id')
        .single();
      guestId = newGuest?.id ?? null;
    }
  }

  const { data, error } = await admin
    .from('tmc_stays')
    .insert({
      org_id: orgId,
      guest_id: guestId,
      property_id: prop?.id ?? null,
      property_code: propertyCode || null,
      check_in: body.checkIn,
      check_out: body.checkOut,
      check_in_time: body.checkInTime ?? null,
      check_out_time: body.checkOutTime ?? null,
      booking_channel: body.bookingChannel ?? null,
      stay_type: body.stayType ?? 'paid',
      room_rate: body.roomRate ? Number(body.roomRate) : null,
      promotion_pct: body.promotionPct ? Number(body.promotionPct) : null,
      deposit_amount: body.depositAmount ? Number(body.depositAmount) : null,
      group_size: body.groupSize ? Number(body.groupSize) : null,
      group_type: body.groupType ?? null,
      butler_service_visit: body.butlerServiceVisit ?? null,
      food_amount: body.foodAmount ? Number(body.foodAmount) : null,
      drink_amount: body.drinkAmount ? Number(body.drinkAmount) : null,
      mookata_amount: body.mookataAmount ? Number(body.mookataAmount) : null,
      bbq_amount: body.bbqAmount ? Number(body.bbqAmount) : null,
      activity_detail: body.activityDetail ?? null,
      feedback: body.feedback ?? null,
      issues: body.issues ?? null,
      damaged_items: body.damagedItems ?? null,
      created_by: auth.userId,
    })
    .select(`*, tmc_guests(first_name, last_name, nickname, tel)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { id, orgId } = body as Record<string, string>;
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_stays')
    .update({
      booking_channel: body.bookingChannel ?? null,
      stay_type: body.stayType ?? 'paid',
      room_rate: body.roomRate ? Number(body.roomRate) : null,
      promotion_pct: body.promotionPct ? Number(body.promotionPct) : null,
      group_size: body.groupSize ? Number(body.groupSize) : null,
      group_type: body.groupType ?? null,
      butler_service_visit: body.butlerServiceVisit ?? null,
      food_amount: body.foodAmount ? Number(body.foodAmount) : null,
      drink_amount: body.drinkAmount ? Number(body.drinkAmount) : null,
      mookata_amount: body.mookataAmount ? Number(body.mookataAmount) : null,
      bbq_amount: body.bbqAmount ? Number(body.bbqAmount) : null,
      activity_detail: body.activityDetail ?? null,
      feedback: body.feedback ?? null,
      issues: body.issues ?? null,
      damaged_items: body.damagedItems ?? null,
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const id = p.get('id') ?? '';
  const orgId = p.get('orgId') ?? '';
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!['owner', 'admin', 'management'].includes(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ management' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('tmc_stays').delete().eq('id', id).eq('org_id', orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
