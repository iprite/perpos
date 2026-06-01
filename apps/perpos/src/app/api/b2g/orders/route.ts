import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../_lib/module-auth';
import { createAdminClient } from '../../_lib/supabase';
import { canModuleWrite } from '@/lib/modules';
import { setAuditContext } from '../../_lib/audit';

// GET /api/b2g/orders?orgId=...
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'b2g');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('b2g_orders')
    .select('*')
    .eq('org_id', orgId)
    .order('seq_no', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data ?? [] });
}

// POST /api/b2g/orders?orgId=...
export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'b2g');
  if (!auth.ok) return auth.res;

  if (!canModuleWrite('b2g', auth.moduleRole)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียนข้อมูล' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { customer_name } = body;
  if (!customer_name?.trim()) {
    return NextResponse.json({ error: 'customer_name is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, auth.orgId);

  const { data, error } = await admin
    .from('b2g_orders')
    .insert({ ...sanitize(body), org_id: auth.orgId, created_by: auth.userId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ order: data }, { status: 201 });
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
