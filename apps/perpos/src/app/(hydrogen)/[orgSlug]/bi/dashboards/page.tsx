// dashboards/page.tsx — รายการแดชบอร์ดส่วนตัว (`[orgSlug]/bi/dashboards`)
// full SSR: ดึงรายการตอน render (display ล้วน) → client ทำเฉพาะ mutation (สร้าง/เปลี่ยนชื่อ/ลบ)
// guard = requireBiPage (getModuleRoleForCurrentUser) · ข้อมูล `bi_*` ผ่าน lib/bi เท่านั้น

import Link from "next/link";
import { LayoutDashboard, Sparkles } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { loadDashboardsPage, requireBiPage } from "../_components/guard";
import { DashboardListClient } from "../_components/dashboard-list-client";

export default async function BiDashboardsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireBiPage(orgSlug);
  const { dashboards } = await loadDashboardsPage(ctx);

  return (
    <PageShell
      title="แดชบอร์ด"
      description="คำตอบที่ปักหมุดไว้ — ระบบคำนวณตัวเลขใหม่ให้ทุกครั้งที่เปิดหน้า"
      icon={<LayoutDashboard className="h-6 w-6" />}
      width="default"
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${orgSlug}/bi`}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            ไปห้องถาม-ตอบ
          </Link>
        </Button>
      }
    >
      <DashboardListClient
        orgId={ctx.orgId}
        orgSlug={orgSlug}
        canWrite={ctx.canWrite}
        dashboards={dashboards}
      />
    </PageShell>
  );
}
