import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

const ALL_MODULE_KEYS = ['accounting', 'payroll', 'assistant'] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data: orgs, error: orgErr } = await admin
    .from('organizations')
    .select('id, name')
    .order('name');
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ orgs: orgs ?? [] });

  const { data: rows } = await admin
    .from('org_module_settings')
    .select('module_key, is_enabled, allowed_roles')
    .eq('organization_id', orgId);

  const map = new Map((rows ?? []).map((r: Record<string, unknown>) => [r.module_key, r]));
  const settings = ALL_MODULE_KEYS.map((key) => ({
    module_key: key,
    is_enabled: Boolean((map.get(key) as Record<string, unknown> | undefined)?.is_enabled ?? false),
    allowed_roles: ((map.get(key) as Record<string, unknown> | undefined)?.allowed_roles as string[]) ?? ['owner', 'admin'],
  }));

  return NextResponse.json({ orgs: orgs ?? [], settings });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const { orgId, settings } = (body ?? {}) as { orgId?: string; settings?: unknown[] };
  if (!orgId || !Array.isArray(settings)) {
    return NextResponse.json({ error: 'missing orgId or settings' }, { status: 400 });
  }

  const admin = createAdminClient();
  const rows = settings.map((s: unknown) => {
    const setting = s as Record<string, unknown>;
    return {
      organization_id: orgId,
      module_key: String(setting.module_key),
      is_enabled: Boolean(setting.is_enabled),
      allowed_roles: Array.isArray(setting.allowed_roles) ? setting.allowed_roles : [],
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await admin
    .from('org_module_settings')
    .upsert(rows, { onConflict: 'organization_id,module_key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
