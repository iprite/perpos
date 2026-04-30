"use client";

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

import { useAuth } from "@/app/shared/auth-provider";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading, userId } = useAuth();

  useEffect(() => {
    if (!loading && !userId) router.replace("/sign-in");
  }, [loading, router, userId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    );
  }

  if (!userId) return null;
  return <>{children}</>;
}

