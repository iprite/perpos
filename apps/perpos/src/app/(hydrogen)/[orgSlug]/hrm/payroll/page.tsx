// payroll/page.tsx — เงินเดือน (server component, RLS)
// guard + listRuns(rls, orgId) + คำนวณ summary จากรอบล่าสุด (approved/paid) → props ให้ client view
// ตาม CONTEXT §5: per-org module = server + getModuleRoleForCurrentUser + createSupabaseServerClient

import { Wallet } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { listRuns, getRun } from "@/lib/hrm/payroll";
import { requireHrmPage } from "../_components/guard";
import { PayrollClient, type PayrollSummary } from "./_payroll-client";

export default async function PayrollPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireHrmPage(orgSlug);
  const runs = await listRuns(ctx.rls, ctx.orgId);

  // summary KPI = รอบล่าสุด (เรียงจากใหม่สุดแล้วใน listRuns) + breakdown สลิปของรอบนั้น
  const latest = runs[0] ?? null;
  let summary: PayrollSummary = {
    period_label: null,
    employer_cost: 0,
    total_net: 0,
    total_wht: 0,
    total_sso: 0,
  };
  if (latest) {
    const { payslips } = await getRun(ctx.rls, ctx.orgId, latest.id);
    summary = {
      period_label: { year: latest.period_year, month: latest.period_month },
      employer_cost: latest.total_employer_cost,
      total_net: latest.total_net,
      total_wht: payslips.reduce((s, p) => s + (p.wht_amount || 0), 0),
      total_sso: payslips.reduce((s, p) => s + (p.sso_employee || 0) + (p.sso_employer || 0), 0),
    };
  }

  return (
    <PageShell
      width="full"
      icon={<Wallet className="h-6 w-6" />}
      title="เงินเดือน"
      description="ทำรอบจ่าย — คำนวณภาษี/ปกส./กองทุน ออกสลิป อนุมัติ และจ่าย ครบในที่เดียว"
    >
      <PayrollClient
        initial={runs}
        summary={summary}
        orgId={ctx.orgId}
        canWrite={ctx.canWrite}
        role={ctx.role}
      />
    </PageShell>
  );
}
