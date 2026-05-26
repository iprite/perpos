import { NextRequest, NextResponse } from 'next/server';
import { requireTmcMember } from '../_lib';
import { recordMetric } from '@/lib/metrics';

/** Generate list of YYYY-MM strings between two dates (inclusive) */
function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const p  = req.nextUrl.searchParams;
  const orgId = p.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const from = p.get('from') ?? new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to   = p.get('to')   ?? new Date().toISOString().slice(0, 10);

  const db = auth.rls;

  const [invRes, finRes, pettyRes, staysRes] = await Promise.all([
    db.from('tmc_property_investments')
      .select('property_code, investment_amount, annual_rate, starts_at, ends_at')
      .eq('org_id', orgId),
    db.from('tmc_finance_entries')
      .select('entry_date, income, expense, property_code')
      .eq('org_id', orgId)
      .gte('entry_date', from)
      .lte('entry_date', to),
    db.from('tmc_petty_cash_txns')
      .select('txn_date, txn_type, amount, property_code')
      .eq('org_id', orgId)
      .eq('txn_type', 'expense')
      .gte('txn_date', from)
      .lte('txn_date', to),
    db.from('tmc_stays')
      .select('check_in, room_rate, food_amount, drink_amount, mookata_amount, bbq_amount, property_code')
      .eq('org_id', orgId)
      .gte('check_in', from)
      .lte('check_in', to),
  ]);

  const investments = invRes.data ?? [];
  const finRows     = finRes.data   ?? [];
  const pettyRows   = pettyRes.data ?? [];
  const stayRows    = staysRes.data ?? [];

  const months = monthRange(from, to);

  // Investment properties (exclude ส่วนกลาง)
  const invMap = new Map(investments.map(i => [i.property_code, i]));
  const SHARED_CODE = 'ส่วนกลาง';

  // ─── Aggregate operating data by property+month ───────────────────
  type PMap = Record<string, { income: number; opex: number; petty: number; shared_fin: number; shared_petty: number }>;
  const byPropMonth: Record<string, PMap> = {};

  function ensure(month: string, prop: string) {
    if (!byPropMonth[month]) byPropMonth[month] = {};
    if (!byPropMonth[month][prop]) byPropMonth[month][prop] = { income: 0, opex: 0, petty: 0, shared_fin: 0, shared_petty: 0 };
    return byPropMonth[month][prop];
  }

  for (const e of finRows) {
    const m = e.entry_date.slice(0, 7);
    const k = e.property_code ?? SHARED_CODE;
    const cell = ensure(m, k);
    cell.income += Number(e.income ?? 0);
    cell.opex   += Number(e.expense ?? 0);
  }
  for (const t of pettyRows) {
    const m = t.txn_date.slice(0, 7);
    const k = t.property_code ?? SHARED_CODE;
    ensure(m, k).petty += Number(t.amount ?? 0);
  }
  for (const s of stayRows) {
    const m = s.check_in.slice(0, 7);
    const k = s.property_code ?? SHARED_CODE;
    const cell = ensure(m, k);
    cell.income += Number(s.room_rate   ?? 0)
                 + Number(s.food_amount ?? 0)
                 + Number(s.drink_amount ?? 0)
                 + Number(s.mookata_amount ?? 0)
                 + Number(s.bbq_amount ?? 0);
  }

  // ─── Monthly rows with investor cost + shared allocation ──────────
  type MonthRow = {
    month:          string;
    properties: {
      code:           string;
      investment:     number;
      investor_cost:  number;  // monthly = amount × rate / 12
      income:         number;
      opex:           number;
      petty:          number;
      shared_alloc:   number;  // ส่วนกลาง / active_props count
      net:            number;  // income - opex - petty - investor_cost - shared_alloc
    }[];
    totals: {
      income:         number;
      opex:           number;
      petty:          number;
      investor_cost:  number;
      shared_expense: number;
      net:            number;
    };
  };

  const result: MonthRow[] = months.map(month => {
    // Which investment properties are active this month?
    const monthStart = new Date(`${month}-01`);
    const activeInvProps = investments.filter(inv => {
      if (inv.property_code === SHARED_CODE) return false;
      const start = new Date(inv.starts_at);
      const end   = inv.ends_at ? new Date(inv.ends_at) : null;
      return start <= monthStart && (!end || end >= monthStart);
    });

    // Shared expense this month (ส่วนกลาง finance + petty)
    const sharedFin   = byPropMonth[month]?.[SHARED_CODE]?.opex   ?? 0;
    const sharedPetty = byPropMonth[month]?.[SHARED_CODE]?.petty  ?? 0;
    const sharedTotal = sharedFin + sharedPetty;

    // Distribute shared evenly across active investment properties
    const activeCount  = activeInvProps.length || 1;
    const sharedPerProp = sharedTotal / activeCount;

    let totalIncome = 0, totalOpex = 0, totalPetty = 0, totalInvestor = 0;

    const propRows = activeInvProps.map(inv => {
      const code    = inv.property_code;
      const monthly = (Number(inv.investment_amount) * Number(inv.annual_rate)) / 12;
      const cell    = byPropMonth[month]?.[code] ?? { income: 0, opex: 0, petty: 0, shared_fin: 0, shared_petty: 0 };

      const income  = +cell.income.toFixed(2);
      const opex    = +cell.opex.toFixed(2);
      const petty   = +cell.petty.toFixed(2);
      const inv_cost = +monthly.toFixed(2);
      const alloc   = +sharedPerProp.toFixed(2);
      const net     = +(income - opex - petty - inv_cost - alloc).toFixed(2);

      totalIncome   += income;
      totalOpex     += opex;
      totalPetty    += petty;
      totalInvestor += inv_cost;

      return { code, investment: Number(inv.investment_amount), investor_cost: inv_cost, income, opex, petty, shared_alloc: alloc, net };
    });

    // Also include non-investment properties that had activity (e.g. ส่วนกลาง income)
    // but not as separate profit rows — captured in totals only

    return {
      month,
      properties: propRows,
      totals: {
        income:         +totalIncome.toFixed(2),
        opex:           +totalOpex.toFixed(2),
        petty:          +totalPetty.toFixed(2),
        investor_cost:  +totalInvestor.toFixed(2),
        shared_expense: +sharedTotal.toFixed(2),
        net:            +(totalIncome - totalOpex - totalPetty - totalInvestor - sharedTotal).toFixed(2),
      },
    };
  });

  // ─── Grand totals ─────────────────────────────────────────────────
  const grand = {
    income:         +result.reduce((s, r) => s + r.totals.income,         0).toFixed(2),
    opex:           +result.reduce((s, r) => s + r.totals.opex,           0).toFixed(2),
    petty:          +result.reduce((s, r) => s + r.totals.petty,          0).toFixed(2),
    investor_cost:  +result.reduce((s, r) => s + r.totals.investor_cost,  0).toFixed(2),
    shared_expense: +result.reduce((s, r) => s + r.totals.shared_expense, 0).toFixed(2),
    net:            +result.reduce((s, r) => s + r.totals.net,            0).toFixed(2),
  };

  // ─── Per-property cumulative summary ─────────────────────────────
  const propSummary: Record<string, {
    code: string; investment: number;
    income: number; opex: number; petty: number;
    investor_cost: number; shared_alloc: number; net: number;
  }> = {};

  for (const row of result) {
    for (const pr of row.properties) {
      if (!propSummary[pr.code]) {
        propSummary[pr.code] = { code: pr.code, investment: pr.investment, income: 0, opex: 0, petty: 0, investor_cost: 0, shared_alloc: 0, net: 0 };
      }
      const s = propSummary[pr.code];
      s.income        += pr.income;
      s.opex          += pr.opex;
      s.petty         += pr.petty;
      s.investor_cost += pr.investor_cost;
      s.shared_alloc  += pr.shared_alloc;
      s.net           += pr.net;
    }
  }

  const byProperty = Object.values(propSummary).map(s => ({
    ...s,
    income:        +s.income.toFixed(2),
    opex:          +s.opex.toFixed(2),
    petty:         +s.petty.toFixed(2),
    investor_cost: +s.investor_cost.toFixed(2),
    shared_alloc:  +s.shared_alloc.toFixed(2),
    net:           +s.net.toFixed(2),
  }));

  void recordMetric({ orgId, route: '/api/tmc/costs', method: 'GET', status: 200, t0 });
  return NextResponse.json({ months: result, grand, byProperty, investments });
}
