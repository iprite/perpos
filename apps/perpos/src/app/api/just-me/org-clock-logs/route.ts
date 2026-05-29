import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../_lib/module-auth';
import { createAdminClient } from '../../_lib/supabase';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ error: 'missing orgId' }, { status: 400 });
  }

  // 1. Authenticate and check if the user belongs to the organization and just_me module
  const auth = await requireModuleMember(req, orgId, 'just_me');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // 2. Double check that the caller is either a super_admin or has owner/admin organization role
  const { data: member } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  const isOrgAdminOrOwner = member && ['owner', 'admin'].includes(String(member.role));
  const isSuperAdmin = auth.isSuperAdmin;

  if (!isSuperAdmin && !isOrgAdminOrOwner) {
    return NextResponse.json(
      { error: 'สิทธิ์ไม่เพียงพอ (ต้องการบทบาท Owner หรือ Admin เพื่อเข้าถึงข้อมูลแดชบอร์ด)' },
      { status: 403 }
    );
  }

  // 3. Fetch all org members with profiles
  const { data: members, error: memErr } = await admin
    .from('organization_members')
    .select(`
      user_id,
      role,
      profile:profiles!organization_members_user_id_fkey(id, display_name, email, avatar_url)
    `)
    .eq('organization_id', orgId);

  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  // 4. Fetch all active clock sessions
  const { data: sessions, error: sessErr } = await admin
    .from('just_me_clock_sessions')
    .select(`
      profile_id,
      org_id,
      status,
      last_in_time,
      last_in_latitude,
      last_in_longitude,
      last_in_address,
      updated_at,
      profile:profiles(id, display_name, email, avatar_url)
    `)
    .eq('org_id', orgId);

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  // 5. Fetch historical clock logs for all users in the org
  const { data: logs, error: logsErr } = await admin
    .from('just_me_clock_logs')
    .select(`
      id,
      profile_id,
      type,
      timestamp,
      latitude,
      longitude,
      address,
      profile:profiles(id, display_name, email, avatar_url)
    `)
    .eq('org_id', orgId)
    .order('timestamp', { ascending: false })
    .limit(1000);

  if (logsErr) {
    return NextResponse.json({ error: logsErr.message }, { status: 500 });
  }

  return NextResponse.json({
    members: members ?? [],
    sessions: sessions ?? [],
    logs: logs ?? [],
  });
}
