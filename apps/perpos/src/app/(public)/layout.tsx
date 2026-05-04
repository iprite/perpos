import Link from "next/link";
import React from "react";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <header className="border-b border-gray-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/signin" className="text-sm font-semibold tracking-wide text-gray-900">
            PERPOS
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/privacy" className="text-gray-600 hover:text-gray-900">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/terms" className="text-gray-600 hover:text-gray-900">
              ข้อกำหนดการให้บริการ
            </Link>
            <Link
              href="/signin"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-900 shadow-sm hover:bg-gray-50"
            >
              เข้าสู่ระบบ
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</main>

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
