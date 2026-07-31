import { Building2 } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TMC_ORG_ID, requireTmcManagerPage } from "./_guard";
import { computeTmcDashboard, rangeFromMonths } from "@/lib/tmc/dashboard";
import { TmcRangeFilter } from "./_range-filter";
import { TmcDashboardTabs } from "./_tabs";
import { TmcDashboardView } from "./_view";
import { TmcCostsView } from "./_costs-view";

export default async function TmcDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    dep?: string;
    tab?: string;
  }>;
}) {
  // Guard: เฉพาะเจ้าของ/ผู้ดูแลโมดูล tmc (หรือ super_admin) — ข้อมูลอ่านผ่าน RLS client
  const { orgSlug } = await params;
  await requireTmcManagerPage(orgSlug);

  const sp = await searchParams;
  const tab = sp.tab === "costs" ? "costs" : "overview";

  // ช่วงเวลา: กำหนดเอง (?from=&to=) ชนะ preset เดือนล่าสุด (?range=)
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const custom = isDate(sp.from) && isDate(sp.to) && (sp.from as string) <= (sp.to as string);
  const range = custom
    ? "custom"
    : ["1", "3", "6", "12"].includes(sp.range ?? "")
      ? (sp.range as string)
      : "6";
  const period = custom
    ? { from: sp.from as string, to: sp.to as string }
    : rangeFromMonths(Number(range));
  // ?dep=ex = ไม่รวมหมวดมัดจำ (ค่ามัดจำ/คืนเงินมัดจำ) ในตัวเลขฝั่งบัญชี
  const excludeDeposits = sp.dep === "ex";

  // แท็บต้นทุนดึงข้อมูลเองฝั่ง client → ไม่ต้อง aggregate ภาพรวมทิ้งเปล่า
  const data =
    tab === "overview"
      ? await computeTmcDashboard(await createSupabaseServerClient(), TMC_ORG_ID, period, {
          excludeDeposits,
        })
      : null;

  return (
    <PageShell
      width="full"
      icon={<Building2 className="h-6 w-6" />}
      title="Dashboard"
      description="TMC Management — ภาพรวมธุรกิจ"
      actions={
        tab === "overview" ? (
          <TmcRangeFilter
            current={range}
            from={custom ? sp.from : undefined}
            to={custom ? sp.to : undefined}
            deposits={excludeDeposits ? "ex" : "in"}
          />
        ) : undefined
      }
      tabs={<TmcDashboardTabs current={tab} />}
    >
      {data ? <TmcDashboardView data={data} /> : <TmcCostsView />}
    </PageShell>
  );
}
