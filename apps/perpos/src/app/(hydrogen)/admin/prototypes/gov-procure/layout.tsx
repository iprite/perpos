// layout.tsx (server) — gate super_admin ทั้งโซน gov-procure prototype + ครอบ providers
// guard เรียกที่ layout ระดับเดียว → page ลูกเป็น client interactive ได้โดยไม่ต้อง guard ซ้ำ
// GovProcureDataProvider (cross-page mock state) + GovProcureRoleProvider (4 role lens §1)

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { GovProcureRoleProvider } from "./_components/role-context";
import { GovProcureDataProvider } from "./_components/data-context";

export default async function GovProcurePrototypeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdminPage();
  return (
    <GovProcureRoleProvider defaultRole="manager">
      <GovProcureDataProvider>{children}</GovProcureDataProvider>
    </GovProcureRoleProvider>
  );
}
