// layout.tsx (server) — gate accounting module ต่อ org (member + RLS) + ครอบ providers
//
// guard (CONTEXT §5 — per-org page guard, ห้าม admin service-role client กับข้อมูล per-org):
//   1) resolve orgSlug → orgId ผ่าน getOrganizationsForCurrentUser (parent [orgSlug]/layout ตรวจ membership แล้ว)
//   2) getModuleRoleForCurrentUser(orgId, 'accounting') — null = ไม่ใช่สมาชิก module → notFound()
//      (super_admin → 'owner')
//   3) ส่ง orgId + role จริงเข้า provider — client ดึงข้อมูลผ่าน API จริง (super_admin bypass + token ทำงาน
//      ถูกที่ API layer; loading skeleton ครอบ first paint). accounting = CRUD หนัก → client fetch (CONTEXT §5).
//   4) role ขับ nav lens + write-gating (ไม่มี role-switcher ใน production — role มาจาก membership จริง)

import { notFound } from "next/navigation";

import {
  getOrganizationsForCurrentUser,
  getModuleRoleForCurrentUser,
} from "@/lib/accounting/queries";
import type { AccountingRole } from "@/lib/accounting/types";

import { AccountingRoleProvider } from "./_components/role-context";
import { AccountingDataProvider } from "./_components/data-provider";

const VALID_ROLES: AccountingRole[] = ["owner", "accountant", "staff", "viewer"];

export default async function AccountingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  // 1) orgSlug → orgId (membership ตรวจที่ parent [orgSlug]/layout แล้ว)
  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  // 2) module membership guard (super_admin → owner)
  const roleRaw = await getModuleRoleForCurrentUser(org.id, "accounting");
  if (!roleRaw) notFound();
  const role: AccountingRole = (VALID_ROLES as string[]).includes(roleRaw)
    ? (roleRaw as AccountingRole)
    : "viewer";

  return (
    <AccountingRoleProvider role={role}>
      {/* client provider fetch ทุก resource ผ่าน API (token + super_admin bypass) — loading skeleton ครอบ */}
      <AccountingDataProvider orgId={org.id}>{children}</AccountingDataProvider>
    </AccountingRoleProvider>
  );
}
