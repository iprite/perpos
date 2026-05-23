import { NextRequest, NextResponse } from 'next/server';
import { requireTmcMember } from '../_lib';

const PETTY_CASH_ACCOUNT = '2366c3f9-dcc5-4091-8ab0-c421b77e7fe7';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const orgId = p.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const from = p.get('from') ?? new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to   = p.get('to')   ?? new Date().toISOString().slice(0, 10);

  const db = auth.rls;

  const [finRes, pettyRes, staysRes, stockRes, staysCountRes] = await Promise.all([
    db.from('tmc_finance_entries')
      .select('entry_date, income, expense, category, property_code, account_id')
      .eq('org_id', orgId)
      .neq('account_id', PETTY_CASH_ACCOUNT)
      .gte('entry_date', from)
      .lte('entry_date', to),
    db.from('tmc_petty_cash_txns')
      .select('txn_date, txn_type, amount, category, property_code')
      .eq('org_id', orgId)
      .gte('txn_date', from)
      .lte('txn_date', to),
    db.from('tmc_stays')
      .select('check_in, check_out, room_rate, food_amount, drink_amount, mookata_amount, bbq_amount, property_code')
      .eq('org_id', orgId)
      .gte('check_in', from)
      .lte('check_in', to),
    db.from('tmc_stock_items')
      .select('name, current_qty, min_quantity')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('current_qty', { ascending: true }),
    // All-time stays count (no date filter) — for summary card accuracy
    db.from('tmc_stays')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
  ]);

  const finRows   = finRes.data   ?? [];
  const pettyRows = pettyRes.data ?? [];
  const stayRows  = staysRes.data ?? [];

  // ─── Monthly aggregates ───────────────────────────────────────────
  type MonthKey = string;
  const finByMonth:   Record<MonthKey, { income: number; expense: number }> = {};
  const pettyByMonth: Record<MonthKey, { top_up: number; expense: number }> = {};
  const staysByMonth: Record<MonthKey, { stays: number; nights: number; revenue: number; food: number }> = {};

  for (const e of finRows) {
    const m = e.entry_date.slice(0, 7);
    if (!finByMonth[m]) finByMonth[m] = { income: 0, expense: 0 };
    finByMonth[m].income  += Number(e.income  ?? 0);
    finByMonth[m].expense += Number(e.expense ?? 0);
  }
  for (const t of pettyRows) {
    const m = t.txn_date.slice(0, 7);
    if (!pettyByMonth[m]) pettyByMonth[m] = { top_up: 0, expense: 0 };
    if (t.txn_type === 'top_up')  pettyByMonth[m].top_up  += Number(t.amount);
    if (t.txn_type === 'expense') pettyByMonth[m].expense += Number(t.amount);
  }
  for (const s of stayRows) {
    const m = s.check_in.slice(0, 7);
    if (!staysByMonth[m]) staysByMonth[m] = { stays: 0, nights: 0, revenue: 0, food: 0 };
    // Calculate nights from check_in / check_out dates
    const nights = s.check_out
      ? Math.max(0, Math.round(
          (new Date(s.check_out).getTime() - new Date(s.check_in).getTime()) / 86_400_000
        ))
      : 1; // default 1 night when check_out not set
    staysByMonth[m].stays++;
    staysByMonth[m].nights  += nights;
    staysByMonth[m].revenue += Number(s.room_rate ?? 0);
    staysByMonth[m].food    += Number(s.food_amount ?? 0) + Number(s.drink_amount ?? 0)
                             + Number(s.mookata_amount ?? 0) + Number(s.bbq_amount ?? 0);
  }

  const allMonths = Array.from(new Set([
    ...Object.keys(finByMonth),
    ...Object.keys(pettyByMonth),
    ...Object.keys(staysByMonth),
  ])).sort();

  const financeMonthly = allMonths.map(m => ({
    month:   m,
    income:  +(finByMonth[m]?.income  ?? 0).toFixed(2),
    expense: +(finByMonth[m]?.expense ?? 0).toFixed(2),
  }));
  const pettyMonthly = allMonths.map(m => ({
    month:   m,
    top_up:  +(pettyByMonth[m]?.top_up  ?? 0).toFixed(2),
    expense: +(pettyByMonth[m]?.expense ?? 0).toFixed(2),
  }));
  const staysMonthly = allMonths.map(m => ({
    month:   m,
    stays:   staysByMonth[m]?.stays   ?? 0,
    nights:  staysByMonth[m]?.nights  ?? 0,
    revenue: +(staysByMonth[m]?.revenue ?? 0).toFixed(2),
    food:    +(staysByMonth[m]?.food    ?? 0).toFixed(2),
  }));

  // ─── By Property ──────────────────────────────────────────────────
  const finByProp:   Record<string, { income: number; expense: number }> = {};
  const pettyByProp: Record<string, number> = {};
  const staysByProp: Record<string, { stays: number; revenue: number }> = {};

  for (const e of finRows) {
    const k = e.property_code ?? '(ไม่ระบุ)';
    if (!finByProp[k]) finByProp[k] = { income: 0, expense: 0 };
    finByProp[k].income  += Number(e.income  ?? 0);
    finByProp[k].expense += Number(e.expense ?? 0);
  }
  for (const t of pettyRows) {
    if (t.txn_type !== 'expense') continue;
    const k = t.property_code ?? '(ไม่ระบุ)';
    pettyByProp[k] = (pettyByProp[k] ?? 0) + Number(t.amount);
  }
  for (const s of stayRows) {
    const k = s.property_code ?? '(ไม่ระบุ)';
    if (!staysByProp[k]) staysByProp[k] = { stays: 0, revenue: 0 };
    staysByProp[k].stays++;
    staysByProp[k].revenue += Number(s.room_rate ?? 0);
    // (nights per stay computed separately above)
  }

  const propKeys = Array.from(new Set([
    ...Object.keys(finByProp),
    ...Object.keys(pettyByProp),
    ...Object.keys(staysByProp),
  ])).sort();

  const byProperty = propKeys.map(k => ({
    property:      k,
    finIncome:     +(finByProp[k]?.income  ?? 0).toFixed(2),
    finExpense:    +(finByProp[k]?.expense ?? 0).toFixed(2),
    pettyExpense:  +(pettyByProp[k] ?? 0).toFixed(2),
    stays:         staysByProp[k]?.stays   ?? 0,
    stayRevenue:   +(staysByProp[k]?.revenue ?? 0).toFixed(2),
  })).sort((a, b) => (b.finIncome + b.stayRevenue) - (a.finIncome + a.stayRevenue));

  // ─── By Category (finance only) ───────────────────────────────────
  const finByCat: Record<string, { income: number; expense: number }> = {};
  for (const e of finRows) {
    const k = e.category ?? '(ไม่ระบุ)';
    if (!finByCat[k]) finByCat[k] = { income: 0, expense: 0 };
    finByCat[k].income  += Number(e.income  ?? 0);
    finByCat[k].expense += Number(e.expense ?? 0);
  }
  const byCategory = Object.entries(finByCat)
    .map(([cat, v]) => ({
      category: cat,
      income:   +v.income.toFixed(2),
      expense:  +v.expense.toFixed(2),
    }))
    .sort((a, b) => (b.income + b.expense) - (a.income + a.expense));

  // ─── Totals ───────────────────────────────────────────────────────
  const totals = {
    finance: {
      income:  +financeMonthly.reduce((s, r) => s + r.income,  0).toFixed(2),
      expense: +financeMonthly.reduce((s, r) => s + r.expense, 0).toFixed(2),
    },
    petty: {
      top_up:  +pettyMonthly.reduce((s, r) => s + r.top_up,  0).toFixed(2),
      expense: +pettyMonthly.reduce((s, r) => s + r.expense, 0).toFixed(2),
    },
    stays: {
      count:   staysMonthly.reduce((s, r) => s + r.stays,  0),
      nights:  staysMonthly.reduce((s, r) => s + r.nights, 0),
      revenue: +staysMonthly.reduce((s, r) => s + r.revenue, 0).toFixed(2),
    },
    stock: {
      items: (stockRes.data ?? []).length,
      low:   (stockRes.data ?? []).filter(i =>
        Number(i.min_quantity) > 0 && Number(i.current_qty) <= Number(i.min_quantity)
      ).length,
    },
    staysAllTime: staysCountRes.count ?? 0,
  };

  return NextResponse.json({
    totals,
    financeMonthly,
    pettyMonthly,
    staysMonthly,
    byProperty,
    byCategory,
    stockLow: (stockRes.data ?? [])
      .filter(i => Number(i.min_quantity) > 0 && Number(i.current_qty) <= Number(i.min_quantity))
      .slice(0, 10)
      .map(i => ({ name: i.name, qty: Number(i.current_qty) })),
  });
}
