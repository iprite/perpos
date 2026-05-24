import { NextRequest, NextResponse } from 'next/server';
import { requireTmcMember } from '../_lib';
import { recordMetric } from '@/lib/metrics';

/** GET ?orgId=&table=tmc_finance_entries&limit=100 */
export async function GET(req: NextRequest) {
  const t0    = Date.now();
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

  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/audit-logs', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/audit-logs', method: req.method, status: 200, t0 });
  return NextResponse.json(data ?? []);
}
