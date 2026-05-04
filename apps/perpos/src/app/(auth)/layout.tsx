import React from "react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-4 sm:p-6">
        {children}
      </div>
    </div>
  );
}
