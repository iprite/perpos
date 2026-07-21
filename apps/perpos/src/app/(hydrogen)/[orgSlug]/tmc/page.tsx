import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getModuleRoleForCurrentUser } from "@/lib/accounting/queries";
import { computeTmcDashboard, rangeFromMonths } from "@/lib/tmc/dashboard";
import { TmcRangeFilter } from "./_range-filter";
import { TmcDashboardView } from "./_view";

// TMC = single-tenant — ผูกกับ org เดียว (เหมือนเดิม)
const TMC_ORG_ID = "1f52618c-09c4-49c5-a929-ea5060f26e7d";

export default async function TmcDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  // Guard: ต้องเป็นสมาชิกโมดูล tmc (หรือ super_admin) — query ผ่าน RLS client (scope ตาม session)
  const role = await getModuleRoleForCurrentUser(TMC_ORG_ID, "tmc");
  if (!role) redirect("/");

  const sp = await searchParams;
  const range = ["1", "3", "6", "12"].includes(sp.range ?? "") ? (sp.range as string) : "6";

  const supabase = await createSupabaseServerClient();
  const data = await computeTmcDashboard(supabase, TMC_ORG_ID, rangeFromMonths(Number(range)));

  return (
    <PageShell
      width="full"
      icon={<Building2 className="h-6 w-6" />}
      title="Dashboard"
      description="TMC Management — ภาพรวมธุรกิจ"
      actions={<TmcRangeFilter current={range} />}
    >
      <TmcDashboardView data={data} />
    </PageShell>
  );
}
