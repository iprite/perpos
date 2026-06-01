import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { canModuleWrite } from '@/lib/modules';
import { setAuditContext } from '../../../_lib/audit';

// PUT /api/b2g/orders/[id]?orgId=...
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'b2g');
  if (!auth.ok) return auth.res;

  if (!canModuleWrite('b2g', auth.moduleRole)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูล' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, auth.orgId);

  const { data, error } = await admin
    .from('b2g_orders')
    .update(sanitize(body))
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ order: data });
}

// DELETE /api/b2g/orders/[id]?orgId=...
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'b2g');
  if (!auth.ok) return auth.res;

  if (!canModuleWrite('b2g', auth.moduleRole)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบข้อมูล' }, { status: 403 });
  }

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, auth.orgId);

  const { error } = await admin
    .from('b2g_orders')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// ---- helpers ----

function sanitize(body: Record<string, unknown>) {
  const allowed = [
    'seq_no', 'customer_name', 'department', 'company', 'qt_reference',
    'product_description', 'start_date',
    'price_incl_vat', 'price_excl_vat', 'withholding_tax', 'net_receivable',
    'cost_price', 'gross_profit', 'security_deposit',
    'transfer_date', 'transfer_round1', 'transfer_round2',
    'customer_change', 'customer_change_slip', 'petty_cash', 'petty_cash_slip',
    'transport_buy', 'transport_sell', 'transport_other', 'operate_89',
    'total_cost_89', 'net_profit_89', 'profit_pct',
    'contract_date', 'payment_order_date', 'delivery_date', 'receipt_date',
    'duration_days', 'job_status', 'finance_payment_date',
    'support_payment_date', 'commission_payment_date', 'notes',
  ];
  return Object.fromEntries(
    allowed
      .filter((k) => body[k] !== undefined)
      .map((k) => [k, body[k] === '' ? null : body[k]])
  );
}
