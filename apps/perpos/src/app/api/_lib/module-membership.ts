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
 * **เติมอย่างเดียว ไม่ถอนสิทธิ์ใคร** — ตั้งใจ:
 *   - ปิดโมดูลไม่ต้องปิดแถว: `requireModuleMember` เช็ค `org_module_settings.is_enabled`
 *     อยู่แล้ว และเมนูก็หายไปเอง · ถ้าปิดแถวด้วย พอเปิดโมดูลกลับมาจะไม่มีอะไรปลุกให้
 *     (เพราะแถวมีอยู่แล้ว insert ก็ข้าม) = ล็อกสมาชิกออกถาวร กลายเป็นบั๊ก 404 ตัวเดิม
 *   - สิทธิ์ที่คนตั้งมือไว้นอกเหนือ org role (เช่น team_member ที่ถูกเชิญเข้า crm เป็นราย
 *     บุคคล) ต้องไม่ถูกล้างเพียงเพราะ superadmin กดบันทึกหน้าโมดูล
 * การถอนสิทธิ์ยังเป็นหน้าที่ของ `syncModuleMembersForOrgRole` (ตอน org role เปลี่ยน) และ
 * `deactivateModuleMembersForOrg` (ตอนถูกเอาออกจาก org) เหมือนเดิม
 *
 * `module_role` ของแถวที่มีอยู่แล้วไม่ถูกแตะ — แถวที่เคยถูกปิดไว้และ role ปัจจุบันเข้าถึงได้
 * จะถูกเปิดกลับโดยคงระดับสิทธิ์เดิม
 */
export async function backfillModuleMembersForOrg(admin: Admin, orgId: string): Promise<void> {
  // ระบุ range ชัดเจน — PostgREST ตัดที่ 1,000 แถวเงียบ ๆ (AGENTS.md) ซึ่งจะทำให้ backfill
  // ครอบไม่ครบโดยไม่มีสัญญาณเตือน
  const [settings, { data: members }, { data: existing }] = await Promise.all([
    fetchModuleSettings(admin, orgId),
    admin
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", orgId)
      .range(0, 9999),
    admin
      .from("module_members")
      .select("user_id, module_key, is_active")
      .eq("org_id", orgId)
      .range(0, 9999),
  ]);
  if (!members?.length) return;

  const activeKeys = new Set<string>();
  const inactiveKeys = new Set<string>();
  for (const m of (existing ?? []) as Record<string, unknown>[]) {
    const key = `${m.user_id}:${m.module_key}`;
    (m.is_active === true ? activeKeys : inactiveKeys).add(key);
  }

  const toInsert: Record<string, unknown>[] = [];
  const reactivateByUser = new Map<string, string[]>();

  for (const m of members as Record<string, unknown>[]) {
    const userId = String(m.user_id);
    const orgRole = String(m.role);

    for (const module_key of allowedModuleKeys(settings, orgRole)) {
      const key = `${userId}:${module_key}`;
      if (activeKeys.has(key)) continue;
      if (inactiveKeys.has(key)) {
        // แถวมีอยู่แต่ถูกปิดไว้ → เปิดกลับ คง module_role เดิม (ไม่เลื่อนขั้นให้ใคร)
        reactivateByUser.set(userId, [...(reactivateByUser.get(userId) ?? []), module_key]);
        continue;
      }
      toInsert.push({
        org_id: orgId,
        module_key,
        user_id: userId,
        module_role: mapOrgRoleToModuleRole(module_key, orgRole) ?? orgRole,
        is_active: true,
      });
    }
  }

  if (toInsert.length > 0) {
    await admin
      .from("module_members")
      .upsert(toInsert, { onConflict: "org_id,module_key,user_id", ignoreDuplicates: true });
  }
  for (const [userId, keys] of Array.from(reactivateByUser.entries())) {
    await admin
      .from("module_members")
      .update({ is_active: true })
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .in("module_key", keys);
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
