import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireTmcMember } from '../_lib';

// GET /api/tmc/stock?orgId=&lowStock=true
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const orgId = p.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  let q = auth.rls
    .from('tmc_stock_items')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (p.get('lowStock') === 'true') {
    q = q.lt('current_qty', auth.rls.from('tmc_stock_items').select('min_quantity'));
  }

  const { data: items } = await q;

  // Recent movements
  const { data: movements } = await auth.rls
    .from('tmc_stock_movements')
    .select('*, tmc_stock_items(name, unit), tmc_properties(code)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ items: items ?? [], movements: movements ?? [] });
}

// POST /api/tmc/stock — add item or record movement
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const orgId = String(body.orgId ?? '');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // action: 'add_item' | 'movement'
  if (body.action === 'add_item') {
    if (!['owner', 'admin', 'team_lead'].includes(auth.role)) {
      return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
    }
    const { data, error } = await admin
      .from('tmc_stock_items')
      .insert({
        org_id: orgId,
        name: body.name,
        unit: body.unit ?? 'ชิ้น',
        min_quantity: Number(body.minQuantity ?? 0),
        category: body.category ?? null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  // Record movement (in/out/adjust)
  const { itemId, movementType, quantity, propertyCode, note, unitCost } = body as Record<string, string>;
  if (!itemId || !movementType || !quantity) {
    return NextResponse.json({ error: 'missing itemId, movementType, or quantity' }, { status: 400 });
  }

  const { data: prop } = propertyCode
    ? await admin.from('tmc_properties').select('id').eq('org_id', orgId).eq('code', propertyCode).maybeSingle()
    : { data: null };

  const { data, error } = await admin
    .from('tmc_stock_movements')
    .insert({
      org_id: orgId,
      item_id: itemId,
      movement_type: movementType,
      quantity: Number(quantity),
      property_id: prop?.id ?? null,
      property_code: propertyCode || null,
      note: note || null,
      unit_cost: unitCost ? Number(unitCost) : null,
      created_by: auth.userId,
    })
    .select(`*, tmc_stock_items(name, unit, current_qty)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
