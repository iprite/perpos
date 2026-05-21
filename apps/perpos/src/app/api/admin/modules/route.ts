import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ALL_MODULES, MODULE_MENUS, ORG_ROLES } from '@/lib/modules';

const ALL_MODULE_KEYS = ALL_MODULES.map((m) => m.key);
const DEFAULT_MODULE_ROLES = ['owner', 'admin'];
const ALL_ROLES = [...ORG_ROLES];

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

  // Module-level settings
  const { data: moduleRows } = await admin
    .from('org_module_settings')
    .select('module_key, is_enabled, allowed_roles')
    .eq('organization_id', orgId);

  const moduleMap = new Map((moduleRows ?? []).map((r: Record<string, unknown>) => [r.module_key, r]));
  const settings = ALL_MODULE_KEYS.map((key) => ({
    module_key:    key,
    is_enabled:    Boolean((moduleMap.get(key) as Record<string, unknown> | undefined)?.is_enabled ?? false),
    allowed_roles: ((moduleMap.get(key) as Record<string, unknown> | undefined)?.allowed_roles as string[]) ?? DEFAULT_MODULE_ROLES,
  }));

  // Menu-level settings
  const { data: menuRows } = await admin
    .from('org_menu_settings')
    .select('module_key, menu_key, allowed_roles')
    .eq('organization_id', orgId);

  const menuMap = new Map(
    (menuRows ?? []).map((r: Record<string, unknown>) => [`${r.module_key}:${r.menu_key}`, r]),
  );

  const menuSettings = ALL_MODULE_KEYS.flatMap((moduleKey) =>
    (MODULE_MENUS[moduleKey] ?? []).map((menu) => {
      const stored = menuMap.get(`${moduleKey}:${menu.key}`) as Record<string, unknown> | undefined;
      return {
        module_key:    moduleKey,
        menu_key:      menu.key,
        allowed_roles: (stored?.allowed_roles as string[]) ?? ALL_ROLES,
      };
    }),
  );

  return NextResponse.json({ orgs: orgs ?? [], settings, menuSettings });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const { orgId, settings, menuSettings } = (body ?? {}) as {
    orgId?: string;
    settings?: unknown[];
    menuSettings?: unknown[];
  };
  if (!orgId || !Array.isArray(settings)) {
    return NextResponse.json({ error: 'missing orgId or settings' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Upsert module-level settings
  const moduleRows = settings.map((s: unknown) => {
    const setting = s as Record<string, unknown>;
    return {
      organization_id: orgId,
      module_key:      String(setting.module_key),
      is_enabled:      Boolean(setting.is_enabled),
      allowed_roles:   Array.isArray(setting.allowed_roles) ? setting.allowed_roles : [],
      updated_at:      now,
    };
  });

  const { error: modErr } = await admin
    .from('org_module_settings')
    .upsert(moduleRows, { onConflict: 'organization_id,module_key' });
  if (modErr) return NextResponse.json({ error: modErr.message }, { status: 500 });

  // Upsert menu-level settings (if provided)
  if (Array.isArray(menuSettings) && menuSettings.length > 0) {
    const menuRows = menuSettings.map((m: unknown) => {
      const ms = m as Record<string, unknown>;
      return {
        organization_id: orgId,
        module_key:      String(ms.module_key),
        menu_key:        String(ms.menu_key),
        allowed_roles:   Array.isArray(ms.allowed_roles) ? ms.allowed_roles : [],
        updated_at:      now,
      };
    });

    const { error: menuErr } = await admin
      .from('org_menu_settings')
      .upsert(menuRows, { onConflict: 'organization_id,module_key,menu_key' });
    if (menuErr) return NextResponse.json({ error: menuErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
