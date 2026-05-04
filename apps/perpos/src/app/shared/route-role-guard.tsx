"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo } from "react";

import { useAuth } from "@/app/shared/auth-provider";
import type { Role } from "@/lib/supabase/types";

type Rule = {
  prefix: string;
  roles: Role[];
};

const rules: Rule[] = [
  { prefix: "/admin", roles: ["admin"] },
];

function pickRedirect(role: Role | null) {
  if (role === "admin") return "/admin";
  if (role === "user") return "/me";
  return "/signin";
}

export default function RouteRoleGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, role } = useAuth();

  const matched = useMemo(() => {
    const p = pathname ?? "/";
    return rules.find((r) => p === r.prefix || p.startsWith(`${r.prefix}/`)) ?? null;
  }, [pathname]);

  useEffect(() => {
    if (loading) return;
    if (!matched) return;
    if (!role) return;
    if (matched.roles.length === 0) {
      router.replace(pickRedirect(role));
      return;
    }
    if (!matched.roles.includes(role)) {
      router.replace(pickRedirect(role));
    }
  }, [loading, matched, pathname, role, router]);

  if (!matched) return <>{children}</>;
  if (loading) return null;
  if (!role) return null;
  if (matched.roles.length === 0) return null;
  if (!matched.roles.includes(role)) return null;

  return <>{children}</>;
}
