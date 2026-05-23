import { NextRequest, NextResponse } from 'next/server';
import { requireTmcMember } from '../_lib';

/** GET ?orgId=&table=tmc_finance_entries&limit=100 */
export async function GET(req: NextRequest) {
  const p     = req.nextUrl.searchParams;
  const orgId = p.get('orgId') ?? '';
  const table = p.get('table') ?? 'tmc_finance_entries';
  const limit = Math.min(200, Number(p.get('limit') ?? '100'));

  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { data, error } = await auth.rls
    .from('tmc_audit_logs')
    .select('id, action, changed_at, table_name, record_id, old_data, new_data, profiles(display_name, email)')
    .eq('org_id', orgId)
    .eq('table_name', table)
    .order('changed_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
