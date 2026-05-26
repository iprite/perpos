import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireCrmMember } from '../_lib';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  const [{ data: clients }, { data: solutions }] = await Promise.all([
    admin.from('crm_clients').select('id, status').eq('org_id', orgId),
    admin.from('crm_solutions').select('id, status, priority, value, created_at').eq('org_id', orgId),
  ]);

  const cl = clients ?? [];
  const sl = solutions ?? [];

  // By status count + value
  const byStatus: Record<string, { count: number; value: number }> = {};
  for (const s of sl) {
    if (!byStatus[s.status]) byStatus[s.status] = { count: 0, value: 0 };
    byStatus[s.status].count++;
    byStatus[s.status].value += Number(s.value ?? 0);
  }

  // Monthly created (last 6 months)
  const now = new Date();
  const monthly: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = 0;
  }
  for (const s of sl) {
    const key = s.created_at.slice(0, 7);
    if (key in monthly) monthly[key]++;
  }

  // Pipeline total value (active)
  const ACTIVE = ['lead', 'proposal', 'in_progress'];
  const pipelineValue = sl
    .filter(s => ACTIVE.includes(s.status))
    .reduce((sum, s) => sum + Number(s.value ?? 0), 0);

  return NextResponse.json({
    totalClients:    cl.length,
    activeClients:   cl.filter(c => c.status === 'active').length,
    prospectClients: cl.filter(c => c.status === 'prospect').length,
    totalSolutions:  sl.length,
    pipelineValue,
    completedValue:  sl.filter(s => s.status === 'completed').reduce((sum, s) => sum + Number(s.value ?? 0), 0),
    byStatus,
    monthly: Object.entries(monthly).map(([month, count]) => ({ month, count })),
  });
}
