import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { canModuleWrite } from '@/lib/modules';
import { setAuditContext } from '../../../_lib/audit';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  const itemId = req.nextUrl.searchParams.get('itemId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });
  if (!itemId) return NextResponse.json({ error: 'missing itemId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'jaquar');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('jaquar_inventory_movements')
    .select('*')
    .eq('item_id', itemId)
    .eq('org_id', orgId)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ movements: data ?? [] });
}

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'jaquar');
  if (!auth.ok) return auth.res;

  if (!canModuleWrite('jaquar', auth.moduleRole)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียนข้อมูลในโมดูลนี้' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { item_id, qty, movement_type, movement_date, reference } = body;

  if (!item_id) return NextResponse.json({ error: 'missing item_id' }, { status: 400 });
  if (qty === undefined || isNaN(Number(qty)) || Number(qty) <= 0) {
    return NextResponse.json({ error: 'invalid or missing qty' }, { status: 400 });
  }
  if (!movement_type || !['in', 'out'].includes(movement_type)) {
    return NextResponse.json({ error: 'invalid or missing movement_type' }, { status: 400 });
  }
  if (!movement_date) return NextResponse.json({ error: 'missing movement_date' }, { status: 400 });

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, auth.orgId);

  // 1. Fetch current item to update its saleable quantity
  const { data: current, error: itemErr } = await admin
    .from('jaquar_inventory_items')
    .select('*')
    .eq('id', item_id)
    .eq('org_id', orgId)
    .single();

  if (itemErr || !current) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const delta = movement_type === 'in' ? Number(qty) : -Number(qty);
  const newTotal = Number(current.total_saleable) + delta;

  // 2. Perform database update & insert as transaction
  const itemUpdate: any = {
    total_saleable: newTotal,
    updated_at: new Date().toISOString(),
  };

  // If manual movement maps to specific headers, keep starting/import fields updated
  const refLower = (reference || '').toLowerCase();
  if (movement_type === 'in') {
    if (refLower.includes('import')) {
      itemUpdate.import_jaquar = Number(current.import_jaquar) + Number(qty);
    } else if (refLower.includes('return')) {
      itemUpdate.return_borrowed = Number(current.return_borrowed) + Number(qty);
    } else if (refLower.includes('starting') || refLower.includes('amount 31.')) {
      itemUpdate.amount_starting = Number(current.amount_starting) + Number(qty);
    }
  }

  // Update item
  const { error: updateErr } = await admin
    .from('jaquar_inventory_items')
    .update(itemUpdate)
    .eq('id', item_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Insert movement log
  const { data: movement, error: movErr } = await admin
    .from('jaquar_inventory_movements')
    .insert({
      org_id: orgId,
      item_id,
      movement_date,
      qty: Number(qty),
      movement_type,
      reference: reference?.trim() || null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (movErr) {
    // Rollback total_saleable if insert fails
    await admin
      .from('jaquar_inventory_items')
      .update({ total_saleable: current.total_saleable })
      .eq('id', item_id);
    return NextResponse.json({ error: movErr.message }, { status: 500 });
  }

  return NextResponse.json({ movement });
}
