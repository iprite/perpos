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

  // 3. Fetch all org members (flat query)
  const { data: members, error: memErr } = await admin
    .from('organization_members')
    .select('user_id, role')
    .eq('organization_id', orgId);

  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  const userIds = (members ?? []).map((m: any) => m.user_id);
  
  // 4. Fetch profiles for these users
  let profiles: any[] = [];
  if (userIds.length > 0) {
    const { data: profs, error: profsErr } = await admin
      .from('profiles')
      .select('id, display_name, email, avatar_url')
      .in('id', userIds);
    
    if (profsErr) {
      return NextResponse.json({ error: profsErr.message }, { status: 500 });
    }
    profiles = profs ?? [];
  }

  // Create a profile map for constant-time lookup
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // 5. Fetch all active clock sessions (flat query)
  const { data: sessions, error: sessErr } = await admin
    .from('just_me_clock_sessions')
    .select('profile_id, org_id, status, last_in_time, last_in_latitude, last_in_longitude, last_in_address, updated_at')
    .eq('org_id', orgId);

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  // 6. Fetch historical clock logs (flat query)
  const { data: logs, error: logsErr } = await admin
    .from('just_me_clock_logs')
    .select('id, profile_id, type, timestamp, latitude, longitude, address')
    .eq('org_id', orgId)
    .order('timestamp', { ascending: false })
    .limit(1000);

  if (logsErr) {
    return NextResponse.json({ error: logsErr.message }, { status: 500 });
  }

  // 7. Manually join profiles in memory
  const membersWithProfiles = (members ?? []).map((m: any) => ({
    user_id: m.user_id,
    role: m.role,
    profile: profileMap.get(m.user_id) || null,
  }));

  const sessionsWithProfiles = (sessions ?? []).map((s: any) => ({
    ...s,
    profile: profileMap.get(s.profile_id) || null,
  }));

  const logsWithProfiles = (logs ?? []).map((l: any) => ({
    ...l,
    profile: profileMap.get(l.profile_id) || null,
  }));

  return NextResponse.json({
    members: membersWithProfiles,
    sessions: sessionsWithProfiles,
    logs: logsWithProfiles,
  });
}
