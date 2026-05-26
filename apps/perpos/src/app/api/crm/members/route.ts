import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireCrmMember } from '../_lib';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // Super-admins see all org members; others see only CRM module members
  let userIds: string[] = [];

  if (auth.role === 'owner') {
    // Fetch all profiles in this org (super_admin sees everyone)
    const { data: members } = await admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId);
    userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
  } else {
    const { data: members } = await admin
      .from('module_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('module_key', 'crm')
      .eq('is_active', true);
    userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
  }

  if (userIds.length === 0) return NextResponse.json([]);

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, display_name')
    .in('id', userIds);

  return NextResponse.json(profiles ?? []);
}
