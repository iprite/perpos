/**
 * /admin/usage — ต้นทุนการใช้งาน แยก Suite (ต่อองค์กร) / Flow (ต่อผู้ใช้) — ฐานสำหรับออกแบบราคาขาย
 *
 * SSR เต็ม: ดึงรายงานตอน render (RPC aggregate ฝั่ง DB) → ไม่มี client fetch ตอน mount
 * ตัวกรอง (ช่วงวัน / org ที่เจาะดู) อยู่ใน searchParams ตามมาตรฐานหน้า list
 */

import { Coins } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import {
  getInfraReport,
  getUsageReport,
  listUsagePrices,
  normalizeUsageDays,
} from "@/lib/admin/usage";
import { AdminPage } from "../_components/admin-page";
import { UsageDaysFilter } from "./_days-filter";
import { UsageView } from "./_view";

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    org?: string;
    user?: string;
    month?: string;
    src?: string;
  }>;
}) {
  const admin = await requireSuperAdminPage();
  const sp = await searchParams;
  const days = normalizeUsageDays(sp.days);
  const orgId = sp.org?.trim() || null;
  const profileId = sp.user?.trim() || null;

  const [report, prices, infra] = await Promise.all([
    getUsageReport(admin, { days, orgId, profileId }),
    listUsagePrices(admin),
    getInfraReport(admin, sp.month?.trim() || null, sp.src?.trim() || null),
  ]);

  return (
    <AdminPage
      title="ต้นทุนการใช้งาน"
      description="รวมทุกอย่างที่เสียเงินตามการใช้ — AI, LINE, บอทประชุม, ประมวลผล, พื้นที่เก็บไฟล์ — แยก Suite (ต่อองค์กร) กับ Flow (ต่อผู้ใช้) เพื่อใช้ตั้งราคาขาย"
      icon={<Coins className="h-6 w-6" />}
      actions={<UsageDaysFilter current={days} />}
    >
      <UsageView
        report={report}
        prices={prices}
        selectedOrgId={orgId}
        selectedProfileId={profileId}
        infra={infra}
      />
    </AdminPage>
  );
}
