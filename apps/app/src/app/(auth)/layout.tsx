import React from "react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center p-4 sm:p-6">
        <div className="grid min-h-[60vh] w-full grid-cols-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden bg-gradient-to-br from-[#0c1446] via-[#2b5c92] to-[#b3cde0] p-8 lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold text-white">ExApp</div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-xs font-semibold text-white">
                  EX
                </div>
              </div>
              <div className="mt-10 text-3xl font-semibold leading-snug text-white">
                ระบบบริหารจัดการแรงงานต่างด้าว
              </div>
            </div>
          </div>
          <div className="p-6 sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
