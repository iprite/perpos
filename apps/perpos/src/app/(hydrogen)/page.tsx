import { redirect } from "next/navigation";
import { getAuthUser, getProfileRole } from "@/lib/supabase/auth-user";
import {
  getActiveOrganizationId,
  getOrganizationsForCurrentUser,
  getEnabledModulesForOrg,
  getActiveModuleKey,
  getPersonalModulesForUser,
  ownMemberships,
} from "@/lib/accounting/queries";
import { ALL_MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAuthUser();

  if (!user) redirect("/signin");

  // Admin → admin console (dedupe ต่อ request ร่วมกับ HydrogenLayout)
  const isSuperAdmin = (await getProfileRole()) === "super_admin";

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
  // ERP (B2B, ถ้าไม่มีผู้ช่วย)
  // ทุกคนที่แอด LINE จะมี grant 'stt' → default ไป /assistant · ผู้ใช้ org-only
  // ที่ไม่มีผู้ช่วย ค่อย fallback เข้า ERP
  if (hasAssistant) redirect("/assistant");

  // หา org module (ERP, non-personal) ของ active org
  // เฉพาะ org ของตัวเอง — ไม่เด้งผู้ใช้เข้า org ลูกค้าที่เข้าถึงได้ในนามสำนักงานบัญชี
  const ownOrgs = ownMemberships(orgs);
  if (ownOrgs.length > 0) {
    const activeOrg = ownOrgs.find((o) => o.id === activeOrgId) ?? ownOrgs[0];
    const orgSlug = activeOrg.slug ?? activeOrg.id;
    const enabledKeys = await getEnabledModulesForOrg(activeOrg.id, activeOrg.role ?? null);
    const savedModuleKey = await getActiveModuleKey(orgSlug, enabledKeys);
    const savedDef = savedModuleKey
      ? ALL_MODULES.find(
          (m) => m.key === savedModuleKey && enabledKeys.includes(m.key) && !m.personal,
        )
      : null;
    const erpModule =
      savedDef ?? ALL_MODULES.find((m) => enabledKeys.includes(m.key) && !m.personal);
    if (erpModule) redirect(`/${orgSlug}${erpModule.href}`);
  }

  // ทุกคนที่แอด LINE ได้ personal module (stt) จาก provisionLineUser เสมอ
  // → ไม่มีสภาวะ "ไม่มีอะไรให้เข้า" จริง ๆ, fallback ที่ผู้ช่วย AI
  redirect("/assistant");
}
