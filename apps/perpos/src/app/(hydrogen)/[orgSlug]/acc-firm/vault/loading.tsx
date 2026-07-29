// loading.tsx — skeleton ของหน้าคลังเอกสารลูกค้า (DESIGN §9 — ห้าม spinner กลางจอ)
// เลียนโครงหน้าแรก: KPI 4 ใบ + แถบตัวกรอง + ตารางลูกค้า

import { PageShell } from "@/components/ui/page-shell";
import { SkeletonStatCards, SkeletonTable } from "@/components/ui/skeleton";

export default function VaultLoading() {
  return (
    <PageShell width="full" title="คลังเอกสารลูกค้า" description="กำลังโหลด…">
      <SkeletonStatCards count={4} />
      <div className="h-14 animate-pulse rounded-xl border border-gray-200 bg-white shadow-sm" />
      <SkeletonTable rows={8} cols={7} />
    </PageShell>
  );
}
