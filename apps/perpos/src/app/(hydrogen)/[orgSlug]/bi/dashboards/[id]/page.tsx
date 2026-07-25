// dashboards/[id]/page.tsx — แดชบอร์ดหนึ่งใบ
// hybrid: SSR ดึงโครง + ผลการ์ดรอบแรก (ไม่มี fetch ตอน mount) → client ทำ mutation/drill-down
// ไม่ใช่เจ้าของ/ไม่มีใบนี้ = notFound() (ห้ามบอกว่ามีอยู่จริง — กฎเดียวกับ thread)

import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutDashboard, Sparkles } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { loadDashboardPage, requireBiPage } from "../../_components/guard";
import { DashboardClient } from "../../_components/dashboard-client";

export default async function BiDashboardDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  const ctx = await requireBiPage(orgSlug);
  const data = await loadDashboardPage(ctx, id);
  if (!data) notFound();

  return (
    <PageShell
      title={data.dashboard.name}
      description="ตัวเลขคำนวณใหม่ทุกครั้งที่เปิดหน้า — ทุกการ์ดบอกนิยามและช่วงเวลาที่ใช้"
      icon={<LayoutDashboard className="h-6 w-6" />}
      width="wide"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${orgSlug}/bi/dashboards`}>แดชบอร์ดทั้งหมด</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${orgSlug}/bi`}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              ไปห้องถาม-ตอบ
            </Link>
          </Button>
        </div>
      }
    >
      <DashboardClient
        orgId={ctx.orgId}
        orgSlug={orgSlug}
        canWrite={ctx.canWrite}
        dashboard={data.dashboard}
        items={data.items}
        results={data.results}
        drill={data.drill}
        quotaExceeded={data.quotaExceeded}
      />
    </PageShell>
  );
}
