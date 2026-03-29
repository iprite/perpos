"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useRole } from "@/app/providers";
import { firstNavHref } from "@/lib/roles";

export default function RootPage() {
  const router = useRouter();
  const { loading, role, user } = useRole();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!role) return;
    router.replace(firstNavHref(role));
  }, [loading, role, router, user]);

  return null;
}
