/**
 * Manage which jtacc accountants have access to a client org.
 *
 * GET  ?firmOrgId=X&clientOrgId=Y
 *   Returns all firm members + their access status to the client org.
 *
 * POST { firmOrgId, clientOrgId, userId, modules }
 *   Provisions access: inserts into organization_members (team_member)
 *   + module_members for each module in `modules`.
 *
 * DELETE { firmOrgId, clientOrgId, userId }
 *   Revokes access: deactivates module_members rows and removes from
 *   organization_members (if no other org access exists).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../_lib/module-auth';
import { createAdminClient } from '../../_lib/supabase';

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const firmOrgId   = searchParams.get('firmOrgId');
  const clientOrgId = searchParams.get('clientOrgId');
  if (!firmOrgId || !clientOrgId)
    return NextResponse.json({ error: 'missing firmOrgId or clientOrgId' }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  // ── Only owner/accountant can manage provisioning ──
  if (auth.moduleRole === 'viewer')
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการ accountants' }, { status: 403 });

  const admin = createAdminClient();

  // 1. Verify engagement exists
  const { data: engagement } = await admin
    .from('acc_firm_clients')
    .select('id, modules_managed, status')
    .eq('firm_org_id', firmOrgId)
    .eq('client_org_id', clientOrgId)
    .maybeSingle();
  if (!engagement)
    return NextResponse.json({ error: 'ไม่พบ engagement นี้' }, { status: 404 });

  // 2. Get all firm org members with profile info
  const { data: firmMembers } = await admin
    .from('organization_members')
    .select('user_id, role, profiles!organization_members_user_id_fkey(id, display_name, email, avatar_url)')
    .eq('organization_id', firmOrgId);

  // 3. Get current module_members of client org that are firm members
  const firmUserIds = (firmMembers ?? []).map(m => m.user_id);
  const { data: clientModuleMembers } = firmUserIds.length
    ? await admin
        .from('module_members')
        .select('user_id, module_key, module_role, is_active')
        .eq('org_id', clientOrgId)
        .in('user_id', firmUserIds)
    : { data: [] };

  // 4. Build per-member access map
  const accessMap = new Map<string, { modules: string[]; active: boolean }>();
  for (const mm of clientModuleMembers ?? []) {
    if (!mm.is_active) continue;
    const existing = accessMap.get(mm.user_id) ?? { modules: [], active: true };
    existing.modules.push(mm.module_key);
    accessMap.set(mm.user_id, existing);
  }

  const members = (firmMembers ?? []).map(m => {
    const profile = m.profiles as unknown as {
      id: string; display_name: string | null; email: string; avatar_url: string | null;
    } | null;
    const access = accessMap.get(m.user_id);
    return {
      userId:      m.user_id,
      firmRole:    m.role,
      displayName: profile?.display_name ?? profile?.email ?? m.user_id,
      email:       profile?.email ?? '',
      avatarUrl:   profile?.avatar_url ?? null,
      hasAccess:   !!access,
      accessModules: access?.modules ?? [],
    };
  });

  return NextResponse.json({
    members,
    engagement: {
      id:              engagement.id,
      modulesManaged:  engagement.modules_managed,
      status:          engagement.status,
    },
  });
}

// ── POST — provision access ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { firmOrgId, clientOrgId, userId, modules } = body ?? {};

  if (!firmOrgId || !clientOrgId || !userId)
    return NextResponse.json({ error: 'missing firmOrgId, clientOrgId, or userId' }, { status: 400 });

  const auth = await requireModuleMember(req, String(firmOrgId), 'acc_firm');
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === 'viewer')
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ provision' }, { status: 403 });

  const admin = createAdminClient();

  // Verify engagement
  const { data: engagement } = await admin
    .from('acc_firm_clients')
    .select('id, modules_managed')
    .eq('firm_org_id', String(firmOrgId))
    .eq('client_org_id', String(clientOrgId))
    .eq('status', 'active')
    .maybeSingle();
  if (!engagement)
    return NextResponse.json({ error: 'ไม่พบ active engagement' }, { status: 404 });

  // Verify the target user is actually a firm member
  const { data: firmMembership } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', String(firmOrgId))
    .eq('user_id', String(userId))
    .maybeSingle();
  if (!firmMembership)
    return NextResponse.json({ error: 'user ไม่ใช่สมาชิกของ firm org' }, { status: 400 });

  const grantModules = Array.isArray(modules)
    ? (modules as string[]).filter(m => (engagement.modules_managed as string[]).includes(m))
    : engagement.modules_managed as string[];

  if (grantModules.length === 0)
    return NextResponse.json({ error: 'ไม่มี module ที่จะ grant' }, { status: 400 });

  // 1. Add to organization_members of client org (team_member, skip if exists)
  const { error: omErr } = await admin
    .from('organization_members')
    .upsert(
      { organization_id: String(clientOrgId), user_id: String(userId), role: 'team_member' },
      { onConflict: 'organization_id,user_id', ignoreDuplicates: true },
    );
  if (omErr) return NextResponse.json({ error: omErr.message }, { status: 500 });

  // 2. Upsert module_members for each granted module
  const mmRows = grantModules.map(moduleKey => ({
    org_id:      String(clientOrgId),
    module_key:  moduleKey,
    user_id:     String(userId),
    module_role: 'accountant',
    is_active:   true,
    invited_by:  auth.userId,
  }));

  const { error: mmErr } = await admin
    .from('module_members')
    .upsert(mmRows, { onConflict: 'org_id,module_key,user_id' });
  if (mmErr) return NextResponse.json({ error: mmErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, grantedModules: grantModules });
}

// ── DELETE — revoke access ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { firmOrgId, clientOrgId, userId } = body ?? {};

  if (!firmOrgId || !clientOrgId || !userId)
    return NextResponse.json({ error: 'missing firmOrgId, clientOrgId, or userId' }, { status: 400 });

  const auth = await requireModuleMember(req, String(firmOrgId), 'acc_firm');
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === 'viewer')
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ revoke' }, { status: 403 });

  const admin = createAdminClient();

  // Verify engagement
  const { data: engagement } = await admin
    .from('acc_firm_clients')
    .select('id, modules_managed')
    .eq('firm_org_id', String(firmOrgId))
    .eq('client_org_id', String(clientOrgId))
    .maybeSingle();
  if (!engagement)
    return NextResponse.json({ error: 'ไม่พบ engagement' }, { status: 404 });

  // 1. Deactivate module_members for all managed modules
  const { error: mmErr } = await admin
    .from('module_members')
    .update({ is_active: false })
    .eq('org_id', String(clientOrgId))
    .eq('user_id', String(userId))
    .in('module_key', engagement.modules_managed as string[]);
  if (mmErr) return NextResponse.json({ error: mmErr.message }, { status: 500 });

  // 2. Remove from organization_members of client org
  //    (only if they have no other active modules in this org)
  const { data: remaining } = await admin
    .from('module_members')
    .select('id')
    .eq('org_id', String(clientOrgId))
    .eq('user_id', String(userId))
    .eq('is_active', true)
    .limit(1);

  if (!remaining?.length) {
    await admin
      .from('organization_members')
      .delete()
      .eq('organization_id', String(clientOrgId))
      .eq('user_id', String(userId))
      .neq('role', 'owner'); // safety: never delete the org owner
  }

  return NextResponse.json({ ok: true });
}
