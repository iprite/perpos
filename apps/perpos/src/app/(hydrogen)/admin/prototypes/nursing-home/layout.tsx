// layout.tsx (server) — gate super_admin ทั้งโซน nursing_home prototype + ครอบ role context
// guard เรียกที่ layout ระดับเดียว → page ลูกเป็น client interactive ได้โดยไม่ต้อง guard ซ้ำ

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { NursingRoleProvider } from "./_components/role-context";

export default async function NursingHomeLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminPage();
  return <NursingRoleProvider defaultRole="owner">{children}</NursingRoleProvider>;
}
