import Link from "next/link";
import React from "react";
import { headers } from "next/headers";
import Logo from "@core/components/logo";
import PublicHeaderActions from "./public-header-actions";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname    = headersList.get("x-pathname") ?? "/";
  const isClockPage = pathname.includes("/just-me-clock");

  if (isClockPage) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col justify-center py-4">
        <main className="mx-auto w-full max-w-md px-4">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-gray-50 to-gray-100">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label="PERPOS" className="shrink-0">
            <Logo className="h-8 w-auto" />
          </Link>
          <PublicHeaderActions />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="sticky bottom-0 z-40 border-t border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
