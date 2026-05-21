import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireTmcMember, canWriteFinance } from '../_lib';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const orgId = p.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  let q = auth.rls
    .from('tmc_finance_entries')
    .select(`
      *,
      tmc_accounts(name, account_type),
      tmc_properties(code, name)
    `)
    .eq('org_id', orgId)
    .order('entry_date', { ascending: false });

  if (p.get('accountId')) q = q.eq('account_id', p.get('accountId')!);
  if (p.get('propertyCode')) q = q.eq('property_code', p.get('propertyCode')!);
  if (p.get('category')) q = q.eq('category', p.get('category')!);
  if (p.get('from')) q = q.gte('entry_date', p.get('from')!);
  if (p.get('to')) q = q.lte('entry_date', p.get('to')!);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const orgId = String(body.orgId ?? '');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
  }

  const { accountId, entryDate, description, checkInDate, checkOutDate,
    category, propertyCode, income, expense, note } = body as Record<string, string>;

  if (!accountId || !entryDate || !description || !category) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
  }

  // Resolve property_id from code
  const admin = createAdminClient();
  const { data: prop } = await admin
    .from('tmc_properties')
    .select('id')
    .eq('org_id', orgId)
    .eq('code', propertyCode)
    .maybeSingle();

  const { data, error } = await admin
    .from('tmc_finance_entries')
    .insert({
      org_id: orgId,
      account_id: accountId,
      entry_date: entryDate,
      description,
      check_in_date: checkInDate || null,
      check_out_date: checkOutDate || null,
      category,
      property_id: prop?.id ?? null,
      property_code: propertyCode || null,
      income: income ? Number(income) : null,
      expense: expense ? Number(expense) : null,
      note: note || null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { id, orgId, ...fields } = body as Record<string, string>;
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_finance_entries')
    .update({
      entry_date: fields.entryDate,
      description: fields.description,
      category: fields.category,
      property_code: fields.propertyCode || null,
      income: fields.income ? Number(fields.income) : null,
      expense: fields.expense ? Number(fields.expense) : null,
      note: fields.note || null,
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
  if (!['owner', 'admin', 'team_lead'].includes(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('tmc_finance_entries')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
