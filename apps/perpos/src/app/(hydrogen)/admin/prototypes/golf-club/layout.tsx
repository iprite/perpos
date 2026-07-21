// layout.tsx (server) — gate super_admin ทั้งโซน golf-club prototype + ครอบ providers
// guard ที่ layout ระดับเดียว → page ลูกเป็น client interactive ได้โดยไม่ต้อง guard ซ้ำ
// GolfRoleProvider (role lens/field-lock §1) + GolfDataProvider (cross-page mock state)

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { GolfRoleProvider } from "./_components/role-context";
import { GolfDataProvider } from "./_components/data-context";

export default async function GolfClubPrototypeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdminPage();
  return (
    <GolfRoleProvider defaultRole="manager">
      <GolfDataProvider>{children}</GolfDataProvider>
    </GolfRoleProvider>
  );
}
