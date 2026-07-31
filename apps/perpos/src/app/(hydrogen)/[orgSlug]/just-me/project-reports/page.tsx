/**
 * /[orgSlug]/just-me/project-reports — รายงานเทียบงบข้ามโครงการ (contract §5 ข้อ 7)
 * ท่า: **server component, display ล้วน** · ตัวกรองอยู่ใน URL (searchParams-driven)
 *
 * ⛔ viewer เข้าไม่ได้เลย — ทั้งหน้าเป็นต้นทุน/กำไร (เมนูซ่อนอยู่แล้ว แต่พิมพ์ URL ตรงต้องไม่หลุด)
 * ⛔ ตัวเลขทุกตัวมาจาก `lib/just-me/project-metrics.ts` — หน้านี้ไม่คำนวณเงินเอง
 * กติกาการแสดงผล: ไม่มีข้อมูล = "—" (ห้าม 0) · ค่าประมาณการติด ≈ · %คืบหน้าที่ยังไม่บันทึก = ข้อความ
 */

import { BarChart3, Landmark, Lock, PiggyBank, TrendingDown, Wallet } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
import { listProjects, loadProjectSummaries } from "@/lib/just-me/projects";
import {
  isCountedProject,
  summarizePortfolio,
  sumDefined,
  type ProjectMoneySummary,
} from "@/lib/just-me/project-metrics";
import type { JustMeProject, ProjectStatus } from "@/lib/just-me/types";
import { requireJustMePage } from "../_components/guard";
import { money, moneyShort } from "../_components/format";
import { BudgetBars } from "./_budget-bars";
import { ReportFilters } from "./_report-filters";
import { ReportTable, type ReportRow } from "./_report-table";
import { ProjectHealthAi } from "./_health-ai";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
/** โครงการมากสุดที่ดึงมาคิดยอดรวม (กัน PostgREST ตัดแถวเงียบ — เตือนเมื่อถูกตัด) */
const MAX_PROJECTS = 1000;

type SearchParams = Promise<{
  status?: string;
  year?: string;
  over?: string;
  page?: string;
}>;

export default async function JustMeProjectReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: SearchParams;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireJustMePage(orgSlug);

  if (!ctx.canSeeCost) {
    return (
      <PageShell title="รายงานโครงการ" icon={<BarChart3 className="h-6 w-6" />}>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="rounded-full bg-gray-100 p-4">
            <Lock className="h-8 w-8 text-gray-400" />
          </div>
          <Text className="text-sm font-medium text-gray-900">คุณไม่มีสิทธิ์เข้าหน้านี้</Text>
          <Text className="max-w-md text-sm text-gray-500">
            รายงานนี้เทียบงบกับต้นทุนและกำไรของทุกโครงการ จึงเปิดให้เฉพาะเจ้าของและผู้จัดการเท่านั้น
          </Text>
        </div>
      </PageShell>
    );
  }

  const status = (sp.status ?? "") as ProjectStatus | "";
  const year = Number(sp.year) || 0;
  const onlyOver = sp.over === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  const all = await listProjects(ctx.rls, ctx.orgId, {
    status: status || undefined,
    year: year || undefined,
    limit: MAX_PROJECTS,
  });

  const summaries = await loadProjectSummaries(ctx.rls, ctx.orgId, all.rows);

  // KPI = ทุกโครงการที่ตรงตัวกรอง (ตัด cancelled/lost ออกตาม §8 กฎ 4)
  const counted = all.rows.filter((p) => isCountedProject(p.status));
  const portfolio = summarizePortfolio(
    counted.map((p) => ({ status: p.status, summary: pick(summaries, p) })),
  );
  const forecastProfitTotal = sumDefined(counted.map((p) => pick(summaries, p).forecast_profit));
  const forecastProfitCounted = counted.filter(
    (p) => pick(summaries, p).forecast_profit !== null,
  ).length;

  // แถวของตาราง: เสี่ยงก่อน (เกินงบ → ส่วนต่างมากไปน้อย)
  const rows: ReportRow[] = counted
    .map((p) => toRow(p, pick(summaries, p)))
    .filter((r) => (onlyOver ? r.over_budget : true))
    .sort(
      (a, b) =>
        Number(b.over_budget) - Number(a.over_budget) ||
        (b.cost_variance ?? -Infinity) - (a.cost_variance ?? -Infinity),
    );

  const years = Array.from(
    new Set(all.rows.map((p) => p.start_date?.slice(0, 4)).filter((v): v is string => !!v)),
  ).sort((a, b) => Number(b) - Number(a));

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const barRows = rows.filter((r) => r.budget_cost !== null).slice(0, 8);

  return (
    <PageShell
      title="รายงานโครงการ"
      description="เทียบงบต้นทุนกับที่ใช้จริงและที่ผูกพันไว้ ข้ามทุกโครงการ"
      icon={<BarChart3 className="h-6 w-6" />}
      width="full"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={<Landmark className="h-4 w-4" />}
          label="มูลค่าสัญญารวม"
          value={moneyShort(portfolio.contract_total)}
          sub={`${money(portfolio.contract_total)} · จาก ${portfolio.projects_counted.toLocaleString("th-TH")} โครงการ`}
          tone="primary"
        />
        <StatCard
          icon={<PiggyBank className="h-4 w-4" />}
          label="งบต้นทุนรวม"
          value={moneyShort(portfolio.budget_total)}
          sub={`${money(portfolio.budget_total)} · นับจากโครงการที่อนุมัติ BOQ แล้ว`}
          tone="neutral"
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="ต้นทุนจริงสะสม"
          value={moneyShort(portfolio.actual_total)}
          sub={`${money(portfolio.actual_total)} · เกินงบ ${portfolio.over_budget_count.toLocaleString("th-TH")} โครงการ`}
          tone={portfolio.over_budget_count > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="ต้นทุนผูกพัน"
          value={moneyShort(portfolio.committed_total)}
          sub={`${money(portfolio.committed_total)} · สั่งซื้อแล้วแต่ยังไม่รับของ`}
          tone="info"
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="กำไรคาดการณ์รวม ≈"
          value={`≈ ${moneyShort(forecastProfitTotal)}`}
          sub={`${money(forecastProfitTotal)} · ประมาณการจาก ${forecastProfitCounted.toLocaleString("th-TH")} โครงการที่มีทั้งสัญญาและงบ`}
          tone={
            forecastProfitTotal === null
              ? "neutral"
              : forecastProfitTotal < 0
                ? "negative"
                : "positive"
          }
        />
      </div>

      <Text className="text-xs text-gray-500">
        ตัวเลขที่มี ≈ เป็นการประมาณการ (งานส่วนที่ยังไม่ทำตีด้วยงบ) · ยอดรวมทุกใบตัดโครงการที่ยกเลิก
        และไม่ได้งานออกแล้ว
      </Text>

      {all.truncated && (
        <p className="text-xs text-amber-700">
          รายงานนี้คิดจาก {all.rows.length.toLocaleString("th-TH")} โครงการแรก จากทั้งหมด{" "}
          {all.total.toLocaleString("th-TH")} โครงการ — ตัวเลขยังไม่ครบทั้งหมด
        </p>
      )}

      <ReportFilters status={status} year={year} onlyOver={onlyOver} years={years} />

      <BudgetBars rows={barRows} />

      <ReportTable
        rows={pageRows}
        total={rows.length}
        page={page}
        pageSize={PAGE_SIZE}
        orgSlug={orgSlug}
        query={{ status, year: year ? String(year) : "", over: onlyOver ? "1" : "" }}
      />

      <ProjectHealthAi
        orgId={ctx.orgId}
        projects={rows.map((r) => ({ value: r.id, label: `${r.project_code} · ${r.name}` }))}
      />
    </PageShell>
  );
}

/** summary ของโครงการ (loadProjectSummaries คืนครบทุกใบที่ส่งเข้าไป) */
function pick(map: Map<string, ProjectMoneySummary>, p: JustMeProject): ProjectMoneySummary {
  return map.get(p.id) as ProjectMoneySummary;
}

function toRow(p: JustMeProject, s: ProjectMoneySummary): ReportRow {
  return {
    id: p.id,
    project_code: p.project_code,
    name: p.name,
    status: p.status,
    contract_amount: s.contract_amount,
    budget_cost: s.budget_cost,
    actual_cost: s.actual_cost,
    committed_cost: s.committed_cost,
    cost_variance: s.cost_variance,
    progress_pct: s.progress_pct,
    forecast_profit: s.forecast_profit,
    over_budget: s.over_budget,
  };
}
