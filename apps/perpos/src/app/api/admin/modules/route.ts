import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { ALL_MODULES, MODULE_MENUS, ORG_ROLES } from "@/lib/modules";

/** Returns true if this module is allowed to be enabled for the given org slug */
function isModuleAllowedForOrg(moduleKey: string, orgSlug: string): boolean {
  const def = ALL_MODULES.find((m) => m.key === moduleKey);
  if (!def?.forOrgSlugs) return true; // no slug restriction — always allowed
  return def.forOrgSlugs.includes(orgSlug);
}

const DEFAULT_MODULE_ROLES = ["owner", "admin"];
const ALL_ROLES = [...ORG_ROLES];

// ── Change log helper ─────────────────────────────────────────────────────────
async function writeChangeLogs(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  changedBy: string,
  prev: Record<string, { is_enabled: boolean; allowed_roles: string[] }>,
  next: { module_key: string; is_enabled: boolean; allowed_roles: string[] }[],
) {
  const entries: {
    org_id: string;
    module_key: string;
    action: string;
    changed_by: string;
    old_value: unknown;
    new_value: unknown;
  }[] = [];

  for (const s of next) {
    const old = prev[s.module_key];
    if (!old) continue;

    if (old.is_enabled !== s.is_enabled) {
      entries.push({
        org_id: orgId,
        module_key: s.module_key,
        action: s.is_enabled ? "enabled" : "disabled",
        changed_by: changedBy,
        old_value: { is_enabled: old.is_enabled },
        new_value: { is_enabled: s.is_enabled },
      });
    } else {
      const oldR = [...old.allowed_roles].sort().join(",");
      const newR = [...s.allowed_roles].sort().join(",");
      if (oldR !== newR) {
        entries.push({
          org_id: orgId,
          module_key: s.module_key,
          action: "roles_updated",
          changed_by: changedBy,
          old_value: { allowed_roles: old.allowed_roles },
          new_value: { allowed_roles: s.allowed_roles },
        });
      }
    }
  }

  if (entries.length) {
    await admin.from("org_module_change_log").insert(entries);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data: orgs, error: orgErr } = await admin
    .from("organizations")
    .select("id, name, slug")
    .order("name");
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ orgs: orgs ?? [] });

  // Get slug of selected org (needed to match forOrgSlugs on specific modules)
  const selectedOrg = (orgs ?? []).find((o: Record<string, unknown>) => o.id === orgId) as
    | { id: string; name: string; slug: string }
    | undefined;
  const orgSlug = selectedOrg?.slug ?? "";

  // Module-level settings
  const { data: moduleRows } = await admin
    .from("org_module_settings")
    .select("module_key, is_enabled, allowed_roles")
    .eq("organization_id", orgId);

  const moduleMap = new Map(
    (moduleRows ?? []).map((r: Record<string, unknown>) => [r.module_key, r]),
  );

  const enabledModuleKeys = new Set(
    (moduleRows ?? []).map((r: Record<string, unknown>) => String(r.module_key)),
  );

  // Specific module visibility rules:
  //   • forOrgSlugs defined → show only when org slug matches (even if not yet enabled)
  //   • forOrgSlugs not defined → show only when already enabled (legacy tmc behaviour)
  const visibleModules = ALL_MODULES.filter((m) => {
    // ผู้ช่วย AI/Flow (personal, B2C) = per-profile grant — ไม่ provision ต่อ org ที่หน้านี้
    if (m.personal) return false;
    if (!m.specific) return true;
    if (m.forOrgSlugs) return m.forOrgSlugs.includes(orgSlug);
    return enabledModuleKeys.has(m.key);
  });

  const settings = visibleModules.map((m) => ({
    module_key: m.key,
    is_enabled: Boolean(
      (moduleMap.get(m.key) as Record<string, unknown> | undefined)?.is_enabled ?? false,
    ),
    allowed_roles:
      ((moduleMap.get(m.key) as Record<string, unknown> | undefined)?.allowed_roles as string[]) ??
      DEFAULT_MODULE_ROLES,
    specific: m.specific ?? false,
  }));

  // Menu-level settings
  const { data: menuRows } = await admin
    .from("org_menu_settings")
    .select("module_key, menu_key, allowed_roles")
    .eq("organization_id", orgId);

  const menuMap = new Map(
    (menuRows ?? []).map((r: Record<string, unknown>) => [`${r.module_key}:${r.menu_key}`, r]),
  );

  const menuSettings = visibleModules.flatMap((m) =>
    (MODULE_MENUS[m.key] ?? []).map((menu) => {
      const stored = menuMap.get(`${m.key}:${menu.key}`) as Record<string, unknown> | undefined;
      return {
        module_key: m.key,
        menu_key: menu.key,
        allowed_roles: (stored?.allowed_roles as string[]) ?? ALL_ROLES,
      };
    }),
  );

  // Optional: include recent change history
  const withHistory = req.nextUrl.searchParams.get("history") === "1";
  let changeLog: unknown[] = [];
  if (withHistory) {
    const { data: logRows } = await admin
      .from("org_module_change_log")
      .select(
        `id, module_key, action, old_value, new_value, changed_at,
               changer:profiles!org_module_change_log_changed_by_fkey(display_name, email)`,
      )
      .eq("org_id", orgId)
      .order("changed_at", { ascending: false })
      .limit(50);
    changeLog = logRows ?? [];
  }

  return NextResponse.json({ orgs: orgs ?? [], settings, menuSettings, changeLog });
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
    return NextResponse.json({ error: "missing orgId or settings" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Snapshot previous state before overwriting (for change log)
  const { data: prevRows } = await admin
    .from("org_module_settings")
    .select("module_key, is_enabled, allowed_roles")
    .eq("organization_id", orgId);
  const prevMap: Record<string, { is_enabled: boolean; allowed_roles: string[] }> =
    Object.fromEntries(
      (prevRows ?? []).map((r: Record<string, unknown>) => [
        String(r.module_key),
        { is_enabled: Boolean(r.is_enabled), allowed_roles: (r.allowed_roles as string[]) ?? [] },
      ]),
    );

  // Fetch org slug to validate forOrgSlugs restrictions
  const { data: orgData } = await admin
    .from("organizations")
    .select("slug")
    .eq("id", orgId)
    .single();
  const orgSlug = (orgData as { slug: string } | null)?.slug ?? "";

  // Upsert module-level settings — skip any module that is not allowed for this org
  // (i.e. specific modules with forOrgSlugs that don't include this org's slug)
  const moduleRows = settings
    .map((s: unknown) => {
      const setting = s as Record<string, unknown>;
      return {
        organization_id: orgId,
        module_key: String(setting.module_key),
        is_enabled: Boolean(setting.is_enabled),
        allowed_roles: Array.isArray(setting.allowed_roles) ? setting.allowed_roles : [],
        updated_at: now,
      };
    })
    .filter((row) => {
      if (!isModuleAllowedForOrg(row.module_key, orgSlug)) {
        console.warn(
          `[modules/PUT] Rejected: module "${row.module_key}" is not allowed for org "${orgSlug}"`,
        );
        return false;
      }
      return true;
    });

  const { error: modErr } = await admin
    .from("org_module_settings")
    .upsert(moduleRows, { onConflict: "organization_id,module_key" });
  if (modErr) return NextResponse.json({ error: modErr.message }, { status: 500 });

  // Upsert menu-level settings (if provided)
  if (Array.isArray(menuSettings) && menuSettings.length > 0) {
    const menuRows = menuSettings.map((m: unknown) => {
      const ms = m as Record<string, unknown>;
      return {
        organization_id: orgId,
        module_key: String(ms.module_key),
        menu_key: String(ms.menu_key),
        allowed_roles: Array.isArray(ms.allowed_roles) ? ms.allowed_roles : [],
        updated_at: now,
      };
    });

    const { error: menuErr } = await admin
      .from("org_menu_settings")
      .upsert(menuRows, { onConflict: "organization_id,module_key,menu_key" });
    if (menuErr) return NextResponse.json({ error: menuErr.message }, { status: 500 });
  }

  // Write change log (fire-and-forget — don't block response)
  const nextSettings = settings.map((s: unknown) => {
    const setting = s as Record<string, unknown>;
    return {
      module_key: String(setting.module_key),
      is_enabled: Boolean(setting.is_enabled),
      allowed_roles: Array.isArray(setting.allowed_roles)
        ? (setting.allowed_roles as string[])
        : [],
    };
  });
  void writeChangeLogs(admin, orgId, auth.userId, prevMap, nextSettings);

  return NextResponse.json({ ok: true });
}
