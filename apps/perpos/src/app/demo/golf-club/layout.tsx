// demo/golf-club/layout.tsx — โซนเดโมสาธารณะ (ไม่ต้อง login) สำหรับแชร์ลูกค้าทดลองใช้
// reuse ทุกหน้าจาก (hydrogen)/admin/prototypes/golf-club (mock ล้วน client state — ไม่แตะ DB)
// ต่างจาก prototype layout: ไม่มี requireSuperAdminPage + noindex + header โลโก้ PERPOS + พื้นขาว

import type { Metadata } from "next";
import Logo from "@core/components/logo";
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
        <div className="flex min-h-screen flex-col bg-white">
          <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-3 sm:px-6">
              <a
                href="https://perpos.ai"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="PERPOS"
                className="shrink-0"
              >
                <Logo className="h-8 w-auto" />
              </a>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                เดโมทดลองใช้
              </span>
            </div>
          </header>
          <main className="flex-1 bg-white px-4 py-6 md:px-6">{children}</main>
        </div>
      </GolfDataProvider>
    </GolfRoleProvider>
  );
}
