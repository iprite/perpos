import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { requireMobileToken } from '../_lib';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

/** GET ?t=<token>&id=<stayId>  → ดึง stay เดียว หรือ list ล่าสุด */
export async function GET(req: NextRequest) {
  const auth = await requireMobileToken(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const stayId = req.nextUrl.searchParams.get('id');

  if (stayId) {
    const { data, error } = await admin
      .from('tmc_stays')
      .select(`*, tmc_guests(id, first_name, last_name, tel, nickname), tmc_properties(code, name)`)
      .eq('id', stayId)
      .eq('org_id', TMC_ORG_ID)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // list 20 รายการล่าสุด
  const { data, error } = await admin
    .from('tmc_stays')
    .select(`id, check_in, check_out, property_code, stay_type, room_rate, created_at,
      tmc_guests(first_name, last_name, nickname)`)
    .eq('org_id', TMC_ORG_ID)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST { t, ...stayFields } → สร้าง stay ใหม่ */
export async function POST(req: NextRequest) {
  const auth = await requireMobileToken(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const admin = createAdminClient();

  const propertyCode = String(body.propertyCode ?? '');
  const { data: prop } = propertyCode
    ? await admin.from('tmc_properties').select('id').eq('org_id', TMC_ORG_ID).eq('code', propertyCode).maybeSingle()
    : { data: null };

  // upsert guest
  let guestId: string | null = null;
  if (body.firstName) {
    const tel = String(body.tel ?? '');
    const { data: existing } = tel
      ? await admin.from('tmc_guests').select('id').eq('org_id', TMC_ORG_ID).eq('tel', tel).maybeSingle()
      : { data: null };

    if (existing?.id) {
      guestId = existing.id;
    } else {
      const { data: newGuest } = await admin
        .from('tmc_guests')
        .insert({
          org_id: TMC_ORG_ID,
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
      org_id: TMC_ORG_ID,
      guest_id: guestId,
      property_id: (prop as { id: string } | null)?.id ?? null,
      property_code: propertyCode || null,
      check_in: body.checkIn ?? new Date().toISOString().slice(0, 10),
      check_out: body.checkOut ?? null,
      check_in_time: body.checkInTime ?? null,
      check_out_time: body.checkOutTime ?? null,
      booking_channel: body.bookingChannel ?? null,
      stay_type: body.stayType ?? 'paid',
      room_rate: body.roomRate ? Number(body.roomRate) : null,
      promotion_pct: body.promotionPct ? Number(body.promotionPct) : null,
      deposit_amount: body.depositAmount ? Number(body.depositAmount) : null,
      group_size: body.groupSize ? Number(body.groupSize) : null,
      group_type: body.groupType ?? null,
      food_amount: body.foodAmount ? Number(body.foodAmount) : null,
      drink_amount: body.drinkAmount ? Number(body.drinkAmount) : null,
      mookata_amount: body.mookataAmount ? Number(body.mookataAmount) : null,
      bbq_amount: body.bbqAmount ? Number(body.bbqAmount) : null,
      activity_detail: body.activityDetail ?? null,
      feedback: body.feedback ?? null,
      issues: body.issues ?? null,
      damaged_items: body.damagedItems ?? null,
      created_by: auth.profileId,
    })
    .select(`*, tmc_guests(first_name, last_name, nickname, tel)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** PATCH { t, id, ...fields } → อัปเดต stay */
export async function PATCH(req: NextRequest) {
  const auth = await requireMobileToken(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const admin = createAdminClient();

  const propertyCode = body.propertyCode !== undefined ? String(body.propertyCode) : undefined;
  const { data: prop } = propertyCode
    ? await admin.from('tmc_properties').select('id').eq('org_id', TMC_ORG_ID).eq('code', propertyCode).maybeSingle()
    : { data: null };

  const patch: Record<string, unknown> = {};
  if (body.checkIn        !== undefined) patch.check_in         = body.checkIn;
  if (body.checkOut       !== undefined) patch.check_out        = body.checkOut;
  if (body.checkInTime    !== undefined) patch.check_in_time    = body.checkInTime;
  if (body.checkOutTime   !== undefined) patch.check_out_time   = body.checkOutTime;
  if (body.bookingChannel !== undefined) patch.booking_channel  = body.bookingChannel;
  if (body.stayType       !== undefined) patch.stay_type        = body.stayType;
  if (body.roomRate       !== undefined) patch.room_rate        = body.roomRate ? Number(body.roomRate) : null;
  if (body.promotionPct   !== undefined) patch.promotion_pct    = body.promotionPct ? Number(body.promotionPct) : null;
  if (body.depositAmount  !== undefined) patch.deposit_amount   = body.depositAmount ? Number(body.depositAmount) : null;
  if (body.groupSize      !== undefined) patch.group_size       = body.groupSize ? Number(body.groupSize) : null;
  if (body.groupType      !== undefined) patch.group_type       = body.groupType;
  if (body.foodAmount     !== undefined) patch.food_amount      = body.foodAmount ? Number(body.foodAmount) : null;
  if (body.drinkAmount    !== undefined) patch.drink_amount     = body.drinkAmount ? Number(body.drinkAmount) : null;
  if (body.mookataAmount  !== undefined) patch.mookata_amount   = body.mookataAmount ? Number(body.mookataAmount) : null;
  if (body.bbqAmount      !== undefined) patch.bbq_amount       = body.bbqAmount ? Number(body.bbqAmount) : null;
  if (body.activityDetail !== undefined) patch.activity_detail  = body.activityDetail;
  if (body.feedback       !== undefined) patch.feedback         = body.feedback;
  if (body.issues         !== undefined) patch.issues           = body.issues;
  if (body.damagedItems   !== undefined) patch.damaged_items    = body.damagedItems;
  if (propertyCode        !== undefined) {
    patch.property_code = propertyCode || null;
    patch.property_id   = (prop as { id: string } | null)?.id ?? null;
  }

  const { data, error } = await admin
    .from('tmc_stays')
    .update(patch)
    .eq('id', id)
    .eq('org_id', TMC_ORG_ID)
    .select(`*, tmc_guests(first_name, last_name, nickname, tel)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
