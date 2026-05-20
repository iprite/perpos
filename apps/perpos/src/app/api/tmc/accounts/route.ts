import { NextRequest, NextResponse } from 'next/server';
import { requireTmcMember } from '../_lib';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { data } = await auth.rls
    .from('tmc_accounts')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('sort_order');

  return NextResponse.json(data ?? []);
}
