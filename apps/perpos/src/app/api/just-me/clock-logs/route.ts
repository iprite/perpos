import { NextRequest, NextResponse } from 'next/server';
import { requireJustMeMember } from '../_lib';
import { createAdminClient } from '../../_lib/supabase';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  // 1. Authenticate user and verify module membership
  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // 2. Fetch current clock session state for the user
  const { data: session } = await admin
    .from('just_me_clock_sessions')
    .select('*')
    .eq('profile_id', auth.userId)
    .eq('org_id', orgId)
    .maybeSingle();

  // 3. Fetch historical logs (sorted newest first)
  const { data: logs, error } = await admin
    .from('just_me_clock_logs')
    .select(`
      id,
      type,
      timestamp,
      latitude,
      longitude,
      address,
      profile:profiles(id, display_name, email)
    `)
    .eq('org_id', orgId)
    .eq('profile_id', auth.userId)
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    session: session ?? null,
    logs: logs ?? [],
  });
}
