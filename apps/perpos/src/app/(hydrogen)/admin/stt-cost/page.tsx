import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { computeSttCost, normalizeDays } from "@/lib/admin/stt-cost";
import { AdminPage } from "../_components/admin-page";
import { SttCostDaysFilter } from "./_days-filter";
import { SttCostView } from "./_view";

export default async function AdminSttCostPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = await requireSuperAdminPage();
  const days = normalizeDays((await searchParams).days);
  const s = await computeSttCost(admin, days);

  return (
    <AdminPage
      title="ต้นทุน Gemini (แกะเสียง)"
      icon={<Coins className="h-6 w-6" />}
      actions={
        <>
          <SttCostDaysFilter current={days} />
          <Link href="/admin/stt-stats">
            <Button variant="outline" size="sm">
              สถิติ
            </Button>
          </Link>
        </>
      }
    >
      <SttCostView s={s} />
    </AdminPage>
  );
}
