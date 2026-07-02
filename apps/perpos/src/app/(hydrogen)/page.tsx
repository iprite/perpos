import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getActiveOrganizationId,
  getOrganizationsForCurrentUser,
  getEnabledModulesForOrg,
  getActiveModuleKey,
  getPersonalModulesForUser,
} from "@/lib/accounting/queries";
import { ALL_MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  // Admin → admin console
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isSuperAdmin = profile?.role === "super_admin";

  // Super admin → admin console เป็นหน้าหลัก (เข้า org ผ่าน org switcher / admin)
  // กันกรณี super_admin หลุดเข้า personal module (เช่น stt) จาก saved cookie
  if (isSuperAdmin) redirect("/admin");

  const [activeOrgId, orgs, personalKeys] = await Promise.all([
    getActiveOrganizationId(),
    getOrganizationsForCurrentUser(),
    getPersonalModulesForUser(user.id),
  ]);
  const hasAssistant = personalKeys.includes("stt"); // ผู้ช่วย AI (per-profile)

  // ลำดับ (non-super_admin): Perpos Flow / ผู้ช่วย AI (B2C) เป็น default หลัก >
  // ERP (B2B, ถ้าไม่มีผู้ช่วย) > no-org
  // ทุกคนที่แอด LINE จะมี grant 'stt' → default ไป /assistant · ผู้ใช้ org-only
  // ที่ไม่มีผู้ช่วย ค่อย fallback เข้า ERP
  if (hasAssistant) redirect("/assistant");

  // หา org module (ERP, non-personal) ของ active org
  if (orgs.length > 0) {
    const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];
    const orgSlug = activeOrg.slug ?? activeOrg.id;
    const enabledKeys = await getEnabledModulesForOrg(activeOrg.id, activeOrg.role ?? null);
    const savedModuleKey = await getActiveModuleKey(orgSlug, enabledKeys);
    const savedDef = savedModuleKey
      ? ALL_MODULES.find((m) => m.key === savedModuleKey && enabledKeys.includes(m.key) && !m.personal)
      : null;
    const erpModule = savedDef ?? ALL_MODULES.find((m) => enabledKeys.includes(m.key) && !m.personal);
    if (erpModule) redirect(`/${orgSlug}${erpModule.href}`);
  }

  redirect("/no-org");
}
