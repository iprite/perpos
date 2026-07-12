// demo/golf-club/layout.tsx — โซนเดโมสาธารณะ (ไม่ต้อง login) สำหรับแชร์ลูกค้าทดลองใช้
// reuse ทุกหน้าจาก (hydrogen)/admin/prototypes/golf-club (mock ล้วน client state — ไม่แตะ DB)
// ต่างจาก prototype layout: ไม่มี requireSuperAdminPage + noindex + ใส่ padding เอง (ไม่มี hydrogen shell)

import type { Metadata } from "next";
import { GolfRoleProvider } from "@/app/(hydrogen)/admin/prototypes/golf-club/_components/role-context";
import { GolfDataProvider } from "@/app/(hydrogen)/admin/prototypes/golf-club/_components/data-context";

export const metadata: Metadata = {
  title: "เดโม ระบบจัดการสนามกอล์ฟ & ไดร์ฟกอล์ฟ — PERPOS",
  description: "ทดลองใช้ระบบจัดการสนามกอล์ฟ + จองผ่าน LINE (ข้อมูลตัวอย่าง)",
  robots: { index: false, follow: false },
};

export default function GolfClubDemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <GolfRoleProvider defaultRole="manager">
      <GolfDataProvider>
        <div className="min-h-screen bg-gray-50 px-4 py-6 md:px-6">{children}</div>
      </GolfDataProvider>
    </GolfRoleProvider>
  );
}
