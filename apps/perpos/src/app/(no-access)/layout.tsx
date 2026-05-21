import React from "react";
import Link from "next/link";
import AuthGuard from "@/app/shared/auth-guard";
import Logo from "@core/components/logo";

export const dynamic = "force-dynamic";

export default function NoAccessLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-gray-50">
        <header className="flex h-16 items-center border-b border-gray-100 bg-white px-6">
          <Link href="/" aria-label="Site Logo">
            <Logo className="max-w-[130px]" />
          </Link>
        </header>
        <main className="flex flex-1 flex-col">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
