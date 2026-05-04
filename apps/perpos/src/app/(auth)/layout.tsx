import React from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-4 sm:p-6">
        {children}
      </div>
      <footer className="border-t border-gray-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>© 2026 P2P Solutions. All Rights Reserved.</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/privacy" className="hover:text-gray-900">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/terms" className="hover:text-gray-900">
              ข้อกำหนดการให้บริการ
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
