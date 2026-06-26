// layout.tsx (server) — gate super_admin ทั้งโซน accounting prototype + ครอบ providers
// guard เรียกที่ layout ระดับเดียว → page ลูกเป็น client interactive ได้โดยไม่ต้อง guard ซ้ำ
// AccountingDataProvider (cross-page mock state) + AccountingRoleProvider (role matrix §4)

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { AccountingRoleProvider } from "./_components/role-context";
import { AccountingDataProvider } from "./_components/data-context";

export default async function AccountingPrototypeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdminPage();
  return (
    <AccountingRoleProvider defaultRole="owner">
      <AccountingDataProvider>{children}</AccountingDataProvider>
    </AccountingRoleProvider>
  );
}
