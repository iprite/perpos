import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  const admin = createAdminClient();
  const [memberRes, orgsRes] = await Promise.all([
    admin
      .from('organization_members')
      .select('id, organization_id, role, organizations(name)')
      .eq('user_id', userId),
    admin.from('organizations').select('id, name').order('name'),
  ]);

  if (memberRes.error) return NextResponse.json({ error: memberRes.error.message }, { status: 500 });

  const memberships = (memberRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: String(m.id),
    orgId: String(m.organization_id),
    orgName: String((m.organizations as Record<string, unknown>)?.name ?? ''),
    role: String(m.role),
  }));

  return NextResponse.json({ ok: true, memberships, allOrgs: orgsRes.data ?? [] });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as { userId?: string; orgId?: string; role?: string };
  const { userId, orgId, role = 'member' } = body;
  if (!userId || !orgId) return NextResponse.json({ error: 'missing userId or orgId' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('organization_members')
    .upsert(
      { user_id: userId, organization_id: orgId, role, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,organization_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as { userId?: string; orgId?: string };
  const { userId, orgId } = body;
  if (!userId || !orgId) return NextResponse.json({ error: 'missing userId or orgId' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('organization_members')
    .delete()
    .eq('user_id', userId)
    .eq('organization_id', orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
