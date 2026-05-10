"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/app/shared/auth-provider";

export default function DashboardPage() {
  const router = useRouter();
  const { loading, role } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (role === "admin") {
      router.replace("/admin");
      return;
    }
    if (role === "user") {
      router.replace("/executive-dashboard");
      return;
    }
    router.replace("/signin");
  }, [loading, role, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
    </div>
  );
}
