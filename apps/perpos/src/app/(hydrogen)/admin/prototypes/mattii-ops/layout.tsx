// layout.tsx (server) — gate super_admin ทั้งโซน mattii-ops prototype + ครอบ providers
// guard เรียกที่ layout ระดับเดียว → page ลูกเป็น client interactive ได้โดยไม่ต้อง guard ซ้ำ
// MattiiRoleProvider (role lens §2.2/§2.3) + MattiiDataProvider (client state ข้ามหน้า)

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { MattiiRoleProvider } from "./_components/role-context";
import { MattiiDataProvider } from "./_components/data-context";

export default async function MattiiOpsPrototypeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdminPage();
  return (
    <MattiiRoleProvider defaultRole="owner">
      <MattiiDataProvider>{children}</MattiiDataProvider>
    </MattiiRoleProvider>
  );
}
