import { AdminCommandPalette } from "@/components/admin/command-palette";

/**
 * Admin layout — ครอบทุกหน้าใน /admin
 * mount Command Palette (⌘K) ไว้ระดับนี้ เพื่อให้เรียกได้ทุกหน้า admin
 * (auth guard เป็นหน้าที่ของแต่ละ page ผ่าน requireSuperAdminPage)
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AdminCommandPalette />
    </>
  );
}
