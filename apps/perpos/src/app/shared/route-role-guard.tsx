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
  { prefix: "/users", roles: ["admin"] },
  { prefix: "/services", roles: ["admin", "sale"] },
  { prefix: "/poa-request-types", roles: ["admin"] },
  { prefix: "/poa-price-overrides", roles: ["admin"] },
  { prefix: "/representatives", roles: ["admin"] },

  { prefix: "/invoices", roles: ["admin", "sale", "operation"] },
  { prefix: "/receipts", roles: ["admin", "sale", "operation"] },

  { prefix: "/posts", roles: ["admin", "sale"] },

  { prefix: "/manage-orders", roles: ["admin", "operation"] },
  { prefix: "/poa-requests", roles: ["admin", "operation"] },

  { prefix: "/my-poa-requests", roles: ["representative"] },
  { prefix: "/my-customers", roles: [] },
  { prefix: "/my-workers", roles: [] },
];

const representativeAllowedPrefixes = ["/my-poa-requests", "/customers", "/workers", "/workspace", "/notifications", "/settings"];

function pickRedirect(role: Role | null) {
  if (role === "representative") return "/my-poa-requests";
  return "/";
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
    if (role === "representative") {
      const p = pathname ?? "/";
      const ok = representativeAllowedPrefixes.some((x) => p === x || p.startsWith(`${x}/`));
      if (!ok) {
        router.replace("/my-poa-requests");
        return;
      }
    }
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
  if (role === "representative") {
    const p = pathname ?? "/";
    const ok = representativeAllowedPrefixes.some((x) => p === x || p.startsWith(`${x}/`));
    if (!ok) return null;
  }
  if (matched.roles.length === 0) return null;
  if (!matched.roles.includes(role)) return null;

  return <>{children}</>;
}
