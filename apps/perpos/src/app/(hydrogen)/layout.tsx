import React from "react";

import AuthGuard from "@/app/shared/auth-guard";
import RouteRoleGuard from "@/app/shared/route-role-guard";
import HydrogenLayout from "@/layouts/hydrogen/layout";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <HydrogenLayout>
        <RouteRoleGuard>{children}</RouteRoleGuard>
      </HydrogenLayout>
    </AuthGuard>
  );
}
