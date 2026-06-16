import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getActiveOrganizationId,
  getOrganizationsForCurrentUser,
  getEnabledModulesForOrg,
  getActiveModuleKey,
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

  // Everyone → first enabled module for active org
  const [activeOrgId, orgs] = await Promise.all([
    getActiveOrganizationId(),
    getOrganizationsForCurrentUser(),
  ]);

  // No org membership → super_admin goes to admin console, others to no-org
  if (orgs.length === 0) {
    if (isSuperAdmin) redirect("/admin");
    redirect("/no-org");
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];
  const orgSlug = activeOrg.slug ?? activeOrg.id;
  const enabledKeys = await getEnabledModulesForOrg(activeOrg.id, activeOrg.role ?? null);

  // No accessible module → super_admin falls back to admin console
  if (!ALL_MODULES.some((m) => enabledKeys.includes(m.key))) {
    if (isSuperAdmin) redirect("/admin");
    redirect("/no-org");
  }

  // Restore last-active module — แต่เลี่ยง personal module (stt/assistant) เป็น landing
  // ถ้ามี org module จริง (กัน B2B user หลุดเข้า stt จาก saved cookie); B2C ที่มีแค่ stt ยัง land stt ได้
  const isPersonalKey = (k?: string | null) => !!k && !!ALL_MODULES.find((m) => m.key === k)?.personal;
  const savedModuleKey = await getActiveModuleKey(orgSlug, enabledKeys);
  const savedModule = savedModuleKey && enabledKeys.includes(savedModuleKey) && !isPersonalKey(savedModuleKey)
    ? ALL_MODULES.find((m) => m.key === savedModuleKey) : null;
  const targetModule = savedModule
    ?? ALL_MODULES.find((m) => enabledKeys.includes(m.key) && !m.personal)
    ?? ALL_MODULES.find((m) => enabledKeys.includes(m.key));

  if (!targetModule) {
    if (isSuperAdmin) redirect("/admin");
    redirect("/no-org");
  }

  redirect(`/${orgSlug}${targetModule.href}`);
}
