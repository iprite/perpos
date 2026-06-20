import React from "react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-b from-blue-50/40 via-white to-slate-50">
      {/* Background grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:48px_48px] opacity-80" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-4 sm:p-6">
        {children}
      </div>
    </div>
  );
}
