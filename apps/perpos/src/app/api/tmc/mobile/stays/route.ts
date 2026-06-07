import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { requireMobileToken } from '../_lib';
import { recordMetric } from '@/lib/metrics';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

/** GET ?t=<token>&id=<stayId>  → ดึง stay เดียว หรือ list ล่าสุด */
export async function GET(req: NextRequest) {
  const t0   = Date.now();
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
    if (error) {
      void recordMetric({ orgId: TMC_ORG_ID, route: '/api/tmc/mobile/stays', method: req.method, status: 500, t0 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    void recordMetric({ orgId: TMC_ORG_ID, route: '/api/tmc/mobile/stays', method: req.method, status: 200, t0 });
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

  if (error) {
    void recordMetric({ orgId: TMC_ORG_ID, route: '/api/tmc/mobile/stays', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId: TMC_ORG_ID, route: '/api/tmc/mobile/stays', method: req.method, status: 200, t0 });
  return NextResponse.json(data ?? []);
}

/** POST { t, ...stayFields } → สร้าง stay ใหม่ */
export async function POST(req: NextRequest) {
  const t0   = Date.now();
  const auth = await requireMobileToken(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const admin = createAdminClient();

  // Support either body.propertyCodes (array) or body.propertyCode (single string)
  const propertyCodes: string[] = Array.isArray(body.propertyCodes)
    ? body.propertyCodes.map(String)
    : body.propertyCode
      ? [String(body.propertyCode)]
      : [];

  // Fetch properties matching the codes
  const { data: props } = propertyCodes.length > 0
    ? await admin.from('tmc_properties').select('id, code').eq('org_id', TMC_ORG_ID).in('code', propertyCodes)
    : { data: null };

  const propMap = new Map<string, string>();
  props?.forEach(p => propMap.set(p.code, p.id));

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

  // If no property codes provided, insert a single empty row as fallback
  const count = propertyCodes.length || 1;
  const codesToInsert = propertyCodes.length > 0 ? propertyCodes : [''];

  // Calculate divided room rate and deposit amount
  const roomRate = body.roomRate ? Number(body.roomRate) : null;
  const depositAmount = body.depositAmount ? Number(body.depositAmount) : null;

  const dividedRate = roomRate !== null ? Number((roomRate / count).toFixed(2)) : null;
  const dividedDeposit = depositAmount !== null ? Number((depositAmount / count).toFixed(2)) : null;

  const rows = codesToInsert.map((code, idx) => {
    const isFirst = idx === 0;
    return {
      org_id: TMC_ORG_ID,
      guest_id: guestId,
      property_id: code ? (propMap.get(code) ?? null) : null,
      property_code: code || null,
      check_in: body.checkIn ?? new Date().toISOString().slice(0, 10),
      check_out: body.checkOut ?? null,
      check_in_time: body.checkInTime ?? null,
      check_out_time: body.checkOutTime ?? null,
      booking_channel: body.bookingChannel ?? null,
      stay_type: body.stayType ?? 'paid',
      room_rate: dividedRate,
      promotion_pct: body.promotionPct ? Number(body.promotionPct) : null,
      deposit_amount: dividedDeposit,
      group_size: body.groupSize ? Number(body.groupSize) : null,
      group_type: body.groupType ?? null,
      // Extra charges and notes only on first stay to avoid duplication
      food_amount: isFirst && body.foodAmount ? Number(body.foodAmount) : null,
      drink_amount: isFirst && body.drinkAmount ? Number(body.drinkAmount) : null,
      mookata_amount: isFirst && body.mookataAmount ? Number(body.mookataAmount) : null,
      bbq_amount: isFirst && body.bbqAmount ? Number(body.bbqAmount) : null,
      activity_detail: isFirst ? (body.activityDetail ?? null) : null,
      feedback: isFirst ? (body.feedback ?? null) : null,
      issues: isFirst ? (body.issues ?? null) : null,
      damaged_items: isFirst ? (body.damagedItems ?? null) : null,
      created_by: auth.profileId,
    };
  });

  const { data, error } = await admin
    .from('tmc_stays')
    .insert(rows)
    .select(`*, tmc_guests(first_name, last_name, nickname, tel)`);

  if (error) {
    void recordMetric({ orgId: TMC_ORG_ID, route: '/api/tmc/mobile/stays', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const savedData = data && data.length > 0 ? data[0] : null;

  void recordMetric({ orgId: TMC_ORG_ID, route: '/api/tmc/mobile/stays', method: req.method, status: 201, t0 });
  return NextResponse.json(savedData, { status: 201 });
}

/** PATCH { t, id, ...fields } → อัปเดต stay */
export async function PATCH(req: NextRequest) {
  const t0   = Date.now();
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

  if (error) {
    void recordMetric({ orgId: TMC_ORG_ID, route: '/api/tmc/mobile/stays', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId: TMC_ORG_ID, route: '/api/tmc/mobile/stays', method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
