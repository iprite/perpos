import React from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-50/40 via-white to-slate-50 relative">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none opacity-80" />

      <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-4 sm:p-6 relative z-10">
        {children}
      </div>

      <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur relative z-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>© 2026 P2P Solutions. All Rights Reserved.</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/privacy" className="text-slate-400 hover:text-blue-600 transition-colors">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/terms" className="text-slate-400 hover:text-blue-600 transition-colors">
              ข้อกำหนดการให้บริการ
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
