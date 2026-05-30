import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';

type ReceiveItem = { name: string; unit: string; qty: number };

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'just_me');
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as {
    warehouseId: string;
    referenceNo?: string;
    note?: string;
    items: ReceiveItem[];
  };

  const { warehouseId, referenceNo, note, items } = body;

  if (!warehouseId) {
    return NextResponse.json({ error: 'กรุณาเลือกคลังปลายทาง' }, { status: 400 });
  }

  const validItems = (items ?? []).filter(i => i.name?.trim() && Number(i.qty) > 0);
  if (validItems.length === 0) {
    return NextResponse.json({ error: 'กรุณาระบุรายการสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch all existing items for this org once to minimise queries
  const { data: existingItems } = await admin
    .from('just_me_inventory_items')
    .select('id, name, unit')
    .eq('org_id', orgId);

  const results: { name: string; itemId: string; qty: number; created: boolean }[] = [];
  const errors: string[] = [];

  for (let idx = 0; idx < validItems.length; idx++) {
    const line = validItems[idx];
    const qty = Number(line.qty);
    const unit = line.unit?.trim() || 'ชิ้น';
    const name = line.name.trim();

    // Match existing item by name (case-insensitive)
    const matched = (existingItems ?? []).find(
      i => i.name.toLowerCase() === name.toLowerCase(),
    );

    let itemId: string;
    let created = false;

    if (matched) {
      itemId = matched.id;
    } else {
      // Auto-create a simple item (no serial, no cable tracking)
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const code = `AUTO-${datePart}-${String(idx + 1).padStart(3, '0')}`;

      const { data: newItem, error: createErr } = await admin
        .from('just_me_inventory_items')
        .insert({
          org_id: orgId,
          name,
          code,
          unit,
          has_serial: false,
          has_cable_measurement: false,
          conversion_rate: 1,
          min_stock: 0,
        })
        .select('id')
        .single();

      if (createErr || !newItem) {
        errors.push(`สร้างสินค้า "${name}" ไม่สำเร็จ: ${createErr?.message ?? 'unknown'}`);
        continue;
      }
      itemId = newItem.id;
      created = true;
    }

    // Insert movement
    const { error: movErr } = await admin
      .from('just_me_stock_movements')
      .insert({
        org_id: orgId,
        item_id: itemId,
        movement_type: 'receive',
        source_warehouse_id: null,
        destination_warehouse_id: warehouseId,
        quantity: qty,
        reference_no: referenceNo || null,
        note: note || null,
        created_by: auth.userId,
      });

    if (movErr) {
      errors.push(`บันทึกการรับ "${name}" ไม่สำเร็จ: ${movErr.message}`);
      continue;
    }

    // Upsert stock balance
    const { data: bal } = await admin
      .from('just_me_stock_balances')
      .select('quantity')
      .eq('warehouse_id', warehouseId)
      .eq('item_id', itemId)
      .maybeSingle();

    if (bal) {
      await admin
        .from('just_me_stock_balances')
        .update({ quantity: Number(bal.quantity) + qty, updated_at: new Date().toISOString() })
        .eq('warehouse_id', warehouseId)
        .eq('item_id', itemId);
    } else {
      await admin
        .from('just_me_stock_balances')
        .insert({
          org_id: orgId,
          warehouse_id: warehouseId,
          item_id: itemId,
          quantity: qty,
          updated_at: new Date().toISOString(),
        });
    }

    results.push({ name, itemId, qty, created });
  }

  if (errors.length > 0 && results.length === 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
  }

  return NextResponse.json({ results, errors }, { status: 201 });
}
