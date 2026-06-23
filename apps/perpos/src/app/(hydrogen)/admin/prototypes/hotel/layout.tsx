// layout.tsx (server) — gate super_admin ทั้งโซน hotel prototype + ครอบ providers
// guard เรียกที่ layout ระดับเดียว → page ลูกเป็น client interactive ได้โดยไม่ต้อง guard ซ้ำ
// HotelDataProvider (cross-page mock state §14.A) + HotelRoleProvider (matrix §4.1)

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { HotelRoleProvider } from "./_components/role-context";
import { HotelDataProvider } from "./_components/data-context";

export default async function HotelPrototypeLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminPage();
  return (
    <HotelRoleProvider defaultRole="manager">
      <HotelDataProvider>{children}</HotelDataProvider>
    </HotelRoleProvider>
  );
}
