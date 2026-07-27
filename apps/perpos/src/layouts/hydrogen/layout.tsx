import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "./sidebar";
import { ContextToggle } from "./sidebar-footer";
import HamburgerButton from "@/layouts/hamburger-button";
import ProfileMenu from "@/layouts/profile-menu";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ModuleProvider } from "@/app/shared/module-provider";
import { ALL_MODULES } from "@/lib/modules";
import {
  getOrganizationsForCurrentUser,
  getActiveOrganizationId,
  getActiveModuleKey,
  getEnabledModulesForOrg,
  getModuleRoleForCurrentUser,
  getModuleMenuLabels,
  getPersonalModulesForUser,
  getCurrentUserId,
} from "@/lib/accounting/queries";

// Path segments that are NOT org slugs
const SYSTEM_SEGMENTS = new Set(["admin", "user", "signin", "no-org", "assistant"]);

export default async function HydrogenLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";
  const segments = pathname.split("/").filter(Boolean);

  // Determine the active org:
  // - If path is /:orgSlug/... → use slug lookup
  // - For /admin, /user, etc.  → fall back to cookie-based active org
  const orgs = await getOrganizationsForCurrentUser();
  const firstSegment = segments[0] ?? "";
  const isOrgRoute = firstSegment.length > 0 && !SYSTEM_SEGMENTS.has(firstSegment);
  const orgSlugFromUrl = isOrgRoute ? firstSegment : null;

  let activeOrg = orgSlugFromUrl
    ? orgs.find((o) => o.slug === orgSlugFromUrl)
    : (() => {
        // For non-org routes (admin, user) fall back to cookie-based active org
        return undefined; // enabledKeys not needed for admin/user routes
      })();

  // Fallback: if org slug in URL doesn't match any membership, keep activeOrg undefined.
  // The [orgSlug]/layout.tsx will handle notFound() for invalid slugs.

  // For non-org routes, fetch module keys using cookie-based active org (sidebar org switcher)
  if (!activeOrg && !isOrgRoute) {
    const cookieOrgId = await getActiveOrganizationId();
    activeOrg = orgs.find((o) => o.id === cookieOrgId);
  }

  // getCurrentUserId = getAuthUser ที่ cache() ไว้แล้ว (resolve ไปตั้งแต่ getOrganizations…) →
  // ไม่มี round-trip เพิ่ม · org modules / personal modules / module role ยิงขนานกันทั้งหมด
  const currentUserId = await getCurrentUserId();
  const moduleRoleKey =
    isOrgRoute && activeOrg?.id && (segments[1] === "just-me" || segments[1] === "accounting")
      ? segments[1] === "just-me"
        ? "just_me"
        : "accounting"
      : null;
  const [orgModuleKeys, personalKeys, moduleRole] = await Promise.all([
    getEnabledModulesForOrg(activeOrg?.id ?? null, activeOrg?.role ?? null),
    getPersonalModulesForUser(currentUserId),
    moduleRoleKey && activeOrg?.id
      ? getModuleRoleForCurrentUser(activeOrg.id, moduleRoleKey)
      : Promise.resolve(null),
  ]);
  // Merge: personal modules are always visible regardless of org context
  const enabledKeys = Array.from(new Set([...orgModuleKeys, ...personalKeys]));
  const menuLabels = await getModuleMenuLabels(enabledKeys);

  // ปุ่ม "Suite" ชี้ตรงไปหน้าโมดูล (ที่ใช้ล่าสุดจาก cookie ถ้ามี) — ไม่ผ่าน `/[orgSlug]`
  // ซึ่งเป็น server redirect page: เดิมกด 1 ครั้ง = render layout+queries 2 รอบ
  let suiteHref: string | null = null;
  if (activeOrg) {
    const savedKey = await getActiveModuleKey(activeOrg.slug, enabledKeys); // cookie อย่างเดียว
    const mod =
      (savedKey ? ALL_MODULES.find((m) => m.key === savedKey && !m.personal) : null) ??
      ALL_MODULES.find((m) => enabledKeys.includes(m.key) && !m.personal);
    suiteHref = mod ? `/${activeOrg.slug}${mod.href}` : `/${activeOrg.slug}`;
  }

  // ── Server-side module access guard ─────────────────────────────────────────
  // Only enforce for org routes where a module segment is present.
  if (isOrgRoute && segments.length >= 2) {
    const currentModule = ALL_MODULES.find((m) => m.match(pathname));
    if (currentModule && !enabledKeys.includes(currentModule.key)) {
      // fallback ไปโมดูล ERP (per-org) ตัวแรก — ตัด personal module (stt/ผู้ช่วย AI)
      // ออก เพราะ href=/assistant เป็น top-level (prefix orgSlug แล้ว 404) ·
      // ถ้าไม่มี ERP module เหลือ → "/" ให้ root resolve (จะพาไป /assistant สำหรับ B2C)
      const firstEnabled = ALL_MODULES.find((m) => enabledKeys.includes(m.key) && !m.personal);
      const orgSlug = activeOrg?.slug ?? orgSlugFromUrl ?? "";
      redirect(orgSlug && firstEnabled ? `/${orgSlug}${firstEnabled.href}` : "/");
    }
  }

  // ── Module-level role override ───────────────────────────────────────────────
  // For modules that use per-module roles (module_members table), use the
  // module role instead of the org-level role so sidebar gating is correct.
  // (accounting ก็ใช้ per-module role — sidebar ต้องรู้เพื่อซ่อนกลุ่ม "หลังบ้าน (นักบัญชี)"
  //  จาก staff ที่ไม่มีสิทธิ์เข้าเลย ตาม role matrix §4) · ยิงไปพร้อมชุดข้างบนแล้ว
  const effectiveOrgRole: string | null = moduleRole ?? activeOrg?.role ?? null;

  return (
    <ModuleProvider
      enabledKeys={enabledKeys}
      orgSlug={activeOrg?.slug ?? orgSlugFromUrl ?? ""}
      orgRole={effectiveOrgRole}
      menuLabels={menuLabels}
    >
      <main className="flex min-h-screen flex-grow">
        <Sidebar
          className="fixed hidden dark:bg-gray-50 xl:flex"
          organizations={orgs}
          activeOrganizationId={activeOrg?.id ?? null}
          suiteHref={suiteHref}
        />
        <div className="flex w-full flex-col pt-[var(--impersonation-banner-height,0px)] xl:ms-[270px] xl:w-[calc(100%-270px)] 2xl:ms-72 2xl:w-[calc(100%-288px)]">
          <ImpersonationBanner />
          <AnnouncementBanner />
          {/* Mobile header — สูงแค่พอดีปุ่ม hamburger, sticky ติดบนเมื่อ scroll (เฉพาะจอเล็ก) */}
          <header className="sticky top-[var(--impersonation-banner-height,0px)] z-40 flex h-12 items-center border-b border-gray-100 bg-white/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-gray-200/10 dark:bg-gray-50/95 xl:hidden">
            <HamburgerButton
              className="me-0 sm:me-0"
              view={
                <Sidebar
                  className="static h-full w-full 2xl:w-full"
                  organizations={orgs}
                  activeOrganizationId={activeOrg?.id ?? null}
                  suiteHref={suiteHref}
                />
              }
            />
            {/* โลโก้ตัวอักษร PERPOS + toggle สลับ Ai ERP / ผู้ช่วย AI + ปุ่ม avatar ผู้ใช้ — ชิดขวา */}
            <div className="ms-auto flex items-center gap-2">
              <span className="font-neo-tech select-none text-sm font-bold tracking-wide text-primary">
                PERPOS
              </span>
              <ContextToggle
                organizations={orgs}
                activeOrganizationId={activeOrg?.id ?? null}
                suiteHref={suiteHref}
              />
              {/* ปุ่ม avatar — เปิด profile menu ลงด้านล่าง */}
              <ProfileMenu variant="icon" />
            </div>
          </header>
          <div className="flex flex-grow flex-col px-4 pb-6 pt-3 md:px-5 lg:px-6 lg:pb-8 xl:pt-2 3xl:px-8 3xl:pt-4 4xl:px-10 4xl:pb-9">
            <Breadcrumb />
            {children}
          </div>
        </div>
      </main>
    </ModuleProvider>
  );
}
