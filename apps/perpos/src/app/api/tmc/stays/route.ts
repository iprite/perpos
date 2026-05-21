import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireTmcMember } from '../_lib';

const DEFAULT_ACCOUNT_ID = 'a4ee27ea-6568-4097-abd7-a91fbf4805d0'; // กสิกร ออมทรัพย์

/** สร้าง finance entry สำหรับมัดจำ */
async function createDepositFinanceEntry(opts: {
  orgId: string;
  accountId: string;
  entryDate: string;
  propertyCode: string | null;
  guestName: string;
  type: 'received' | 'returned';
  amount: number;
  createdBy: string;
}) {
  const admin = createAdminClient();
  const isReceived = opts.type === 'received';
  const description = isReceived
    ? `รับมัดจำ – ${opts.guestName}${opts.propertyCode ? ` (${opts.propertyCode})` : ''}`
    : `คืนมัดจำ – ${opts.guestName}${opts.propertyCode ? ` (${opts.propertyCode})` : ''}`;

  await admin.from('tmc_finance_entries').insert({
    org_id:       opts.orgId,
    account_id:   opts.accountId,
    entry_date:   opts.entryDate,
    description,
    category:     isReceived ? 'ค่ามัดจำ' : 'คืนเงินมัดจำ',
    property_code: opts.propertyCode,
    income:       isReceived ? opts.amount : null,
    expense:      isReceived ? null : opts.amount,
    note:         'บันทึกอัตโนมัติจากการเข้าพัก',
    created_by:   opts.createdBy,
  });
}

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

  if (p.get('propertyCode'))   q = q.eq('property_code',   p.get('propertyCode')!);
  if (p.get('from'))           q = q.gte('check_in',       p.get('from')!);
  if (p.get('to'))             q = q.lte('check_in',       p.get('to')!);
  if (p.get('stayType'))       q = q.eq('stay_type',       p.get('stayType')!);
  if (p.get('bookingChannel')) q = q.eq('booking_channel', p.get('bookingChannel')!);

  const limit  = Math.min(Number(p.get('limit')  ?? 200), 500);
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
  const propertyCode = String(body.propertyCode ?? '');

  // Resolve property_id
  const { data: prop } = propertyCode
    ? await admin.from('tmc_properties').select('id').eq('org_id', orgId).eq('code', propertyCode).maybeSingle()
    : { data: null };

  // Upsert guest
  let guestId = (body.guestId as string | null) ?? null;
  let guestName = '';
  if (!guestId && body.firstName) {
    const tel = String(body.tel ?? '');
    const firstName = String(body.firstName ?? '');
    const lastName  = String(body.lastName  ?? '');
    guestName = [body.nickname || firstName, lastName].filter(Boolean).join(' ').trim();

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
          first_name: firstName,
          last_name:  lastName  || null,
          nickname:   body.nickname ?? null,
          tel:        tel || null,
          guest_type: body.stayType === 'influencer' ? 'influencer' : 'regular',
        })
        .select('id')
        .single();
      guestId = newGuest?.id ?? null;
    }
  }

  const depositReceived = body.depositReceived ? Number(body.depositReceived) : null;
  const depositReturned = body.depositReturned ? Number(body.depositReturned) : null;
  const depositAccountId = String(body.depositAccountId || DEFAULT_ACCOUNT_ID);
  const checkIn  = String(body.checkIn  ?? '');
  const checkOut = String(body.checkOut ?? '');

  const { data, error } = await admin
    .from('tmc_stays')
    .insert({
      org_id:               orgId,
      guest_id:             guestId,
      property_id:          prop?.id ?? null,
      property_code:        propertyCode || null,
      check_in:             checkIn,
      check_out:            checkOut,
      check_in_time:        body.checkInTime      ?? null,
      check_out_time:       body.checkOutTime     ?? null,
      booking_channel:      body.bookingChannel   ?? null,
      stay_type:            body.stayType         ?? 'paid',
      room_rate:            body.roomRate         ? Number(body.roomRate)         : null,
      promotion_pct:        body.promotionPct     ? Number(body.promotionPct)     : null,
      deposit_amount:       body.depositAmount    ? Number(body.depositAmount)    : null,
      deposit_received:     depositReceived,
      deposit_returned:     depositReturned,
      deposit_account_id:   depositReceived || depositReturned ? depositAccountId : null,
      group_size:           body.groupSize        ? Number(body.groupSize)        : null,
      group_type:           body.groupType        ?? null,
      butler_service_visit: body.butlerServiceVisit ?? null,
      food_amount:          body.foodAmount       ? Number(body.foodAmount)       : null,
      drink_amount:         body.drinkAmount      ? Number(body.drinkAmount)      : null,
      mookata_amount:       body.mookataAmount    ? Number(body.mookataAmount)    : null,
      bbq_amount:           body.bbqAmount        ? Number(body.bbqAmount)        : null,
      activity_detail:      body.activityDetail   ?? null,
      feedback:             body.feedback         ?? null,
      issues:               body.issues           ?? null,
      damaged_items:        body.damagedItems     ?? null,
      created_by:           auth.userId,
    })
    .select('*, tmc_guests(first_name, last_name, nickname, tel)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-create finance entries for deposit
  if (depositReceived && depositReceived > 0 && checkIn) {
    await createDepositFinanceEntry({
      orgId, accountId: depositAccountId,
      entryDate: checkIn, propertyCode: propertyCode || null,
      guestName: guestName || 'ลูกค้า', type: 'received',
      amount: depositReceived, createdBy: auth.userId,
    });
  }
  if (depositReturned && depositReturned > 0 && (checkOut || checkIn)) {
    await createDepositFinanceEntry({
      orgId, accountId: depositAccountId,
      entryDate: checkOut || checkIn, propertyCode: propertyCode || null,
      guestName: guestName || 'ลูกค้า', type: 'returned',
      amount: depositReturned, createdBy: auth.userId,
    });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { id, orgId } = body as Record<string, string>;
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // Fetch existing to compare deposit fields
  const { data: existing } = await admin
    .from('tmc_stays')
    .select('deposit_received, deposit_returned, check_in, check_out, property_code, tmc_guests(first_name, last_name, nickname)')
    .eq('id', id)
    .single();

  const depositReceived  = body.depositReceived  ? Number(body.depositReceived)  : null;
  const depositReturned  = body.depositReturned  ? Number(body.depositReturned)  : null;
  const depositAccountId = String(body.depositAccountId || DEFAULT_ACCOUNT_ID);

  const prevReceived = Number(existing?.deposit_received ?? 0);
  const prevReturned = Number(existing?.deposit_returned ?? 0);
  const checkIn      = existing?.check_in  ?? '';
  const checkOut     = existing?.check_out ?? '';
  const propertyCode = existing?.property_code ?? null;
  const g = existing?.tmc_guests as { first_name?: string; last_name?: string | null; nickname?: string | null } | null;
  const guestName = g?.nickname ?? [g?.first_name, g?.last_name].filter(Boolean).join(' ').trim() ?? 'ลูกค้า';

  const { data, error } = await admin
    .from('tmc_stays')
    .update({
      booking_channel:      body.bookingChannel      ?? null,
      stay_type:            body.stayType            ?? 'paid',
      room_rate:            body.roomRate            ? Number(body.roomRate)    : null,
      promotion_pct:        body.promotionPct        ? Number(body.promotionPct) : null,
      deposit_received:     depositReceived,
      deposit_returned:     depositReturned,
      deposit_account_id:   depositReceived || depositReturned ? depositAccountId : null,
      group_size:           body.groupSize           ? Number(body.groupSize)   : null,
      group_type:           body.groupType           ?? null,
      butler_service_visit: body.butlerServiceVisit  ?? null,
      food_amount:          body.foodAmount          ? Number(body.foodAmount)  : null,
      drink_amount:         body.drinkAmount         ? Number(body.drinkAmount) : null,
      mookata_amount:       body.mookataAmount       ? Number(body.mookataAmount) : null,
      bbq_amount:           body.bbqAmount           ? Number(body.bbqAmount)   : null,
      activity_detail:      body.activityDetail      ?? null,
      feedback:             body.feedback            ?? null,
      issues:               body.issues              ?? null,
      damaged_items:        body.damagedItems        ?? null,
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create finance entry only for newly added deposit (not if same value)
  if (depositReceived && depositReceived > 0 && depositReceived !== prevReceived && checkIn) {
    await createDepositFinanceEntry({
      orgId, accountId: depositAccountId,
      entryDate: checkIn, propertyCode,
      guestName, type: 'received',
      amount: depositReceived, createdBy: auth.userId,
    });
  }
  if (depositReturned && depositReturned > 0 && depositReturned !== prevReturned) {
    await createDepositFinanceEntry({
      orgId, accountId: depositAccountId,
      entryDate: checkOut || checkIn, propertyCode,
      guestName, type: 'returned',
      amount: depositReturned, createdBy: auth.userId,
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const id    = p.get('id')    ?? '';
  const orgId = p.get('orgId') ?? '';
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!['owner', 'admin', 'team_lead'].includes(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('tmc_stays').delete().eq('id', id).eq('org_id', orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
