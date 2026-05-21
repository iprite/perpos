import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireTmcMember, canWriteFinance } from '../_lib';

/** GET /api/tmc/petty-cash?orgId=&fundId=&from=&to=&type= */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const orgId = p.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  let q = auth.rls
    .from('tmc_petty_cash_txns')
    .select('*, tmc_petty_cash_funds(name)')
    .eq('org_id', orgId)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (p.get('fundId'))       q = q.eq('fund_id', p.get('fundId')!);
  if (p.get('txnType'))      q = q.eq('txn_type', p.get('txnType')!);
  if (p.get('propertyCode')) q = q.eq('property_code', p.get('propertyCode')!);
  if (p.get('from'))         q = q.gte('txn_date', p.get('from')!);
  if (p.get('to'))           q = q.lte('txn_date', p.get('to')!);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute running balance per fund
  const txns = data ?? [];
  const totalTopUp  = txns.filter(t => t.txn_type === 'top_up') .reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);
  const totalExpense = txns.filter(t => t.txn_type === 'expense').reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);

  return NextResponse.json({ txns, totalTopUp, totalExpense, balance: totalTopUp - totalExpense });
}

/** POST /api/tmc/petty-cash  → add transaction */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, fundId, txnDate, txnType, amount, description, category, propertyCode, note } =
    body as Record<string, string>;

  if (!orgId || !fundId || !txnDate || !txnType || !amount || !description) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
  }
  if (!['top_up', 'expense'].includes(txnType)) {
    return NextResponse.json({ error: 'invalid txn_type' }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_petty_cash_txns')
    .insert({
      fund_id:       fundId,
      org_id:        orgId,
      txn_date:      txnDate,
      txn_type:      txnType,
      amount:        Number(amount),
      description,
      category:      category || null,
      property_code: propertyCode || null,
      note:          note || null,
      created_by:    auth.userId,
    })
    .select('*, tmc_petty_cash_funds(name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** PUT /api/tmc/petty-cash  → edit transaction */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { id, orgId, txnDate, txnType, amount, description, category, propertyCode, note } = body;
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_petty_cash_txns')
    .update({
      txn_date:      txnDate,
      txn_type:      txnType,
      amount:        Number(amount),
      description,
      category:      category || null,
      property_code: propertyCode || null,
      note:          note || null,
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*, tmc_petty_cash_funds(name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** DELETE /api/tmc/petty-cash?id=&orgId= */
export async function DELETE(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const id    = p.get('id')    ?? '';
  const orgId = p.get('orgId') ?? '';
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!['owner', 'admin', 'management'].includes(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ management ขึ้นไป' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('tmc_petty_cash_txns')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
