/**
 * POST /api/admin/provisioning
 *
 * Enable (or disable) a specific module for an existing org.
 * Simpler than the full PUT /api/admin/modules which requires the whole settings array.
 *
 * Body: { orgId, moduleKey, is_enabled?, allowed_roles? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ALL_MODULES } from '@/lib/modules';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const {
    orgId,
    moduleKey,
    is_enabled    = true,
    allowed_roles = ['owner', 'admin'],
  } = body ?? {};

  if (!orgId || typeof orgId !== 'string') {
    return NextResponse.json({ error: 'missing orgId' }, { status: 400 });
  }
  if (!moduleKey || typeof moduleKey !== 'string') {
    return NextResponse.json({ error: 'missing moduleKey' }, { status: 400 });
  }
  if (!ALL_MODULES.some(m => m.key === moduleKey)) {
    return NextResponse.json({ error: `unknown module: ${moduleKey}` }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify org exists
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle();

  if (!org) {
    return NextResponse.json({ error: 'org not found' }, { status: 404 });
  }

  // Snapshot previous state for change log
  const { data: prev } = await admin
    .from('org_module_settings')
    .select('is_enabled, allowed_roles')
    .eq('organization_id', orgId)
    .eq('module_key', moduleKey)
    .maybeSingle();

  // Upsert module setting
  const { error } = await admin
    .from('org_module_settings')
    .upsert(
      {
        organization_id: orgId,
        module_key:      moduleKey,
        is_enabled:      Boolean(is_enabled),
        allowed_roles:   Array.isArray(allowed_roles) ? allowed_roles : ['owner', 'admin'],
        updated_at:      new Date().toISOString(),
      },
      { onConflict: 'organization_id,module_key' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Write change log (fire-and-forget)
  void admin.from('org_module_change_log').insert({
    org_id:     orgId,
    module_key: moduleKey,
    action:     Boolean(is_enabled) ? 'enabled' : 'disabled',
    changed_by: auth.userId,
    old_value:  prev ?? null,
    new_value:  { is_enabled: Boolean(is_enabled), allowed_roles },
  });

  return NextResponse.json({
    ok:         true,
    org:        { id: (org as Record<string,string>).id, name: (org as Record<string,string>).name, slug: (org as Record<string,string>).slug },
    module_key: moduleKey,
    is_enabled: Boolean(is_enabled),
  }, { status: 200 });
}
