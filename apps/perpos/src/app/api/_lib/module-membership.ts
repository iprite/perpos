/**
 * Keep `module_members` in sync with `organization_members`.
 *
 * Why: the sidebar menu + page/API guards diverge —
 *   - menu visibility = org role + org_module_settings.allowed_roles
 *   - actual access (requireModuleMember / getModuleRoleForCurrentUser) = module_members row
 * A user added to an org (organization_members) without a matching module_members
 * row sees the module in their menu, enters the org area, then gets hard-bounced
 * (page guard returns null → redirect("/")). Calling these helpers whenever an
 * org membership changes keeps the two layers consistent.
 */

import { mapOrgRoleToModuleRole } from "@/lib/modules";

import type { createAdminClient } from "./supabase";

type Admin = ReturnType<typeof createAdminClient>;

type ModuleSetting = { module_key: string; is_enabled: boolean; allowed_roles: string[] };

/** โมดูลที่เปิดอยู่และ org role นี้เข้าถึงได้ */
function allowedModuleKeys(settings: ModuleSetting[], orgRole: string): string[] {
  return settings
    .filter(
      (s) =>
        s.is_enabled === true &&
        Array.isArray(s.allowed_roles) &&
        s.allowed_roles.includes(orgRole),
    )
    .map((s) => s.module_key);
}

async function fetchModuleSettings(admin: Admin, orgId: string): Promise<ModuleSetting[]> {
  const { data } = await admin
    .from("org_module_settings")
    .select("module_key, is_enabled, allowed_roles")
    .eq("organization_id", orgId);
  return (data ?? []).map((s: Record<string, unknown>) => ({
    module_key: String(s.module_key),
    is_enabled: s.is_enabled === true,
    allowed_roles: (s.allowed_roles as string[]) ?? [],
  }));
}

/**
 * Grant/refresh module access for every enabled module whose allowed_roles
 * includes `role`, and revoke (deactivate) module rows the new role can no
 * longer access. module_role mirrors the org role.
 */
export async function syncModuleMembersForOrgRole(
  admin: Admin,
  userId: string,
  orgId: string,
  role: string,
): Promise<void> {
  const settings = await fetchModuleSettings(admin, orgId);
  const allowedKeys = allowedModuleKeys(settings, role);

  // Grant / refresh access for allowed modules
  if (allowedKeys.length > 0) {
    await admin.from("module_members").upsert(
      allowedKeys.map((module_key) => ({
        org_id: orgId,
        module_key,
        user_id: userId,
        module_role: mapOrgRoleToModuleRole(module_key, role) ?? role,
        is_active: true,
      })),
      { onConflict: "org_id,module_key,user_id" },
    );
  }

  // Revoke modules the new role can no longer access
  const { data: existing } = await admin
    .from("module_members")
    .select("module_key")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("is_active", true);

  const toRevoke = (existing ?? [])
    .map((m: Record<string, unknown>) => String(m.module_key))
    .filter((k) => !allowedKeys.includes(k));

  if (toRevoke.length > 0) {
    await admin
      .from("module_members")
      .update({ is_active: false })
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .in("module_key", toRevoke);
  }
}

/**
 * Backfill `module_members` ให้ **สมาชิกทุกคนของ org** ตามการตั้งค่าโมดูลปัจจุบัน
 *
 * เรียกหลังบันทึก `org_module_settings` (superadmin เปิด/ปิดโมดูล หรือแก้ allowed_roles) —
 * ไม่งั้นสมาชิกที่เข้า org **ก่อน** โมดูลถูกเปิดจะไม่มีแถว module_members เลย → เห็นเมนู
 * (เมนูดูจาก org role + allowed_roles) แต่กดเข้าแล้ว `notFound()` ทุกครั้ง
 *
 * เพิ่มเฉพาะแถวที่ขาด — **ไม่แตะ `module_role` ของแถวที่มีอยู่แล้ว** เพื่อไม่ล้างสิทธิ์ที่คน
 * ตั้งมือไว้ (เช่น org admin ที่ถูกจงใจให้เป็น accountant) · แถวที่ role เข้าไม่ถึงแล้วจะถูกปิด
 */
export async function backfillModuleMembersForOrg(admin: Admin, orgId: string): Promise<void> {
  const [settings, { data: members }, { data: existing }] = await Promise.all([
    fetchModuleSettings(admin, orgId),
    admin.from("organization_members").select("user_id, role").eq("organization_id", orgId),
    admin.from("module_members").select("user_id, module_key, is_active").eq("org_id", orgId),
  ]);
  if (!members?.length) return;

  const rows = (existing ?? []).map((m: Record<string, unknown>) => ({
    user_id: String(m.user_id),
    module_key: String(m.module_key),
    is_active: m.is_active === true,
  }));
  const anyKey = new Set(rows.map((r) => `${r.user_id}:${r.module_key}`));

  const toInsert: Record<string, unknown>[] = [];
  const toRevoke: { user_id: string; module_key: string }[] = [];

  for (const m of members as Record<string, unknown>[]) {
    const userId = String(m.user_id);
    const orgRole = String(m.role);
    const allowed = allowedModuleKeys(settings, orgRole);

    for (const module_key of allowed) {
      const key = `${userId}:${module_key}`;
      // แถวที่เคยถูกปิด (is_active=false) ถือว่าตั้งใจถอนสิทธิ์ → ไม่ปลุกกลับเอง
      if (anyKey.has(key)) continue;
      toInsert.push({
        org_id: orgId,
        module_key,
        user_id: userId,
        module_role: mapOrgRoleToModuleRole(module_key, orgRole) ?? orgRole,
        is_active: true,
      });
    }

    for (const r of rows) {
      if (r.is_active && r.user_id === userId && !allowed.includes(r.module_key)) {
        toRevoke.push({ user_id: r.user_id, module_key: r.module_key });
      }
    }
  }

  if (toInsert.length > 0) {
    await admin
      .from("module_members")
      .upsert(toInsert, { onConflict: "org_id,module_key,user_id", ignoreDuplicates: true });
  }
  for (const r of toRevoke) {
    await admin
      .from("module_members")
      .update({ is_active: false })
      .eq("org_id", orgId)
      .eq("user_id", r.user_id)
      .eq("module_key", r.module_key);
  }
}

/** Deactivate all module access when an org member is removed. */
export async function deactivateModuleMembersForOrg(
  admin: Admin,
  userId: string,
  orgId: string,
): Promise<void> {
  await admin
    .from("module_members")
    .update({ is_active: false })
    .eq("org_id", orgId)
    .eq("user_id", userId);
}
