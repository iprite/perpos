import React from "react";

import AuthGuard from "@/app/shared/auth-guard";
import PresenceHeartbeat from "@/app/shared/presence-heartbeat";
import RouteRoleGuard from "@/app/shared/route-role-guard";
import HydrogenLayout from "@/layouts/hydrogen/layout";
import { PageSkeleton } from "@/components/ui/page-skeleton";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // HydrogenLayout (server component: sidebar/header shell) render ทันทีจาก server —
  // AuthGuard ย้ายเข้ามาข้างใน gate เฉพาะ content area แทนที่จะบังทั้งจอ
  // (ระหว่างรอ auth: shell โผล่ + content โชว์ PageSkeleton)
  return (
    <HydrogenLayout>
      <AuthGuard fallback={<PageSkeleton />}>
        <PresenceHeartbeat />
        <RouteRoleGuard>{children}</RouteRoleGuard>
      </AuthGuard>
    </HydrogenLayout>
  );
}
