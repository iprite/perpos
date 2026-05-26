import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { requireTmcMember, canWriteFinance } from '../../_lib';
import { recordMetric } from '@/lib/metrics';

type PurchaseItem = {
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
};

/**
 * POST /api/tmc/stock/purchase
 * Atomically: insert tmc_finance_entries (expense) + tmc_stock_movements (in)
 * New item names not in the stock catalogue are auto-created.
 */
export async function POST(req: NextRequest) {
  const t0   = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, date, accountId, category, propertyCode, note, items } = body as {
    orgId: string; date: string; accountId: string;
    category: string; propertyCode: string; note?: string;
    items: PurchaseItem[];
  };

  if (!orgId || !date || !accountId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
  }

  const admin = createAdminClient();

  // ── 1. Resolve existing stock items by name ─────────────────────────────
  const names = items.map(i => i.name.trim()).filter(Boolean);
  const { data: existingItems } = await admin
    .from('tmc_stock_items')
    .select('id, name, unit')
    .eq('org_id', orgId)
    .in('name', names);

  const itemMap = new Map<string, string>(); // name → id
  for (const e of existingItems ?? []) itemMap.set(e.name, e.id);

  // ── 2. Create missing stock items ──────────────────────────────────────
  const toCreate = items.filter(i => !itemMap.has(i.name.trim()));
  if (toCreate.length > 0) {
    const { data: created, error: createErr } = await admin
      .from('tmc_stock_items')
      .insert(toCreate.map(i => ({
        org_id: orgId,
        name: i.name.trim(),
        unit: i.unit || 'ชิ้น',
        min_quantity: 0,
        created_by: auth.userId,
      })))
      .select('id, name');

    if (createErr) {
      void recordMetric({ orgId, route: '/api/tmc/stock/purchase', method: 'POST', status: 500, t0 });
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    for (const c of created ?? []) itemMap.set(c.name, c.id);
  }

  // ── 3. Resolve property id ──────────────────────────────────────────────
  const { data: prop } = propertyCode
    ? await admin.from('tmc_properties').select('id').eq('org_id', orgId).eq('code', propertyCode).maybeSingle()
    : { data: null };

  // ── 4. Insert stock movements (trigger updates current_qty) ────────────
  const movements = items.map(i => ({
    org_id: orgId,
    item_id: itemMap.get(i.name.trim()) ?? '',
    movement_type: 'in',
    quantity: Number(i.qty),
    unit_cost: Number(i.unitCost),
    property_id: prop?.id ?? null,
    property_code: propertyCode || null,
    note: note || null,
    created_by: auth.userId,
  })).filter(m => m.item_id);

  const { error: movErr } = await admin.from('tmc_stock_movements').insert(movements);
  if (movErr) {
    void recordMetric({ orgId, route: '/api/tmc/stock/purchase', method: 'POST', status: 500, t0 });
    return NextResponse.json({ error: movErr.message }, { status: 500 });
  }

  // ── 5. Insert single finance entry (total expense) ─────────────────────
  const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.unitCost), 0);
  const description = items.map(i => `${i.name} ×${i.qty}`).join(', ');

  const { error: finErr } = await admin.from('tmc_finance_entries').insert({
    org_id: orgId,
    account_id: accountId,
    entry_date: date,
    description,
    category: category || 'แมคโค',
    property_code: propertyCode || null,
    property_id: prop?.id ?? null,
    expense: total,
    note: note || null,
    created_by: auth.userId,
  });

  if (finErr) {
    void recordMetric({ orgId, route: '/api/tmc/stock/purchase', method: 'POST', status: 500, t0 });
    return NextResponse.json({ error: finErr.message }, { status: 500 });
  }

  void recordMetric({ orgId, route: '/api/tmc/stock/purchase', method: 'POST', status: 201, t0 });
  return NextResponse.json({ ok: true, total, itemCount: items.length }, { status: 201 });
}
