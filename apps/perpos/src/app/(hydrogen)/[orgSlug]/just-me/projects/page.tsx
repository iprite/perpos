/**
 * /[orgSlug]/just-me/projects — ทะเบียนโครงการ
 * ท่า: **server component + searchParams-driven** (status/q/page อยู่ใน URL)
 * contract §5 ข้อ 1 · guard = member + RLS (ห้าม service-role กับข้อมูล per-org)
 *
 * viewer: อ่านผ่าน view `just_me_projects_basic` (อ่านตารางตรงได้ 0 แถว) · ไม่มีคอลัมน์ต้นทุน/กำไร
 * ⛔ ตัวเลขเงินทุกตัวมาจาก `lib/just-me/project-metrics.ts` เท่านั้น
 */

import { FolderKanban, Landmark, ReceiptText, TrendingDown } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
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
import { ProjectsClient, type ProjectListRow } from "./_projects-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** สถานะที่ถือว่า "กำลังทำอยู่หน้างาน" (การ์ดใบแรก) */
const WORKING_STATUSES: ProjectStatus[] = ["won", "in_progress"];

type SearchParams = Promise<{ status?: string; q?: string; page?: string }>;

export default async function JustMeProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: SearchParams;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireJustMePage(orgSlug);

  const status = (sp.status ?? "") as ProjectStatus | "";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const basic = !ctx.canSeeCost;

  const [pageData, all] = await Promise.all([
    listProjects(ctx.rls, ctx.orgId, {
      basic,
      status: status || undefined,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    // การ์ด KPI ต้องนับจากทุกโครงการ ไม่ใช่แค่หน้านี้ (ห้ามคิดยอดรวมจากแถวที่ถูกแบ่งหน้า)
    listProjects(ctx.rls, ctx.orgId, { basic, limit: 1000 }),
  ]);

  // สรุปเงินรายโครงการชุดเดียว (คิวรีคงที่) — owner/manager เท่านั้น
  let summaries = new Map<string, ProjectMoneySummary>();
  if (ctx.canSeeCost) {
    const byId = new Map<string, JustMeProject>();
    for (const p of [...all.rows, ...pageData.rows]) byId.set(p.id, p);
    summaries = await loadProjectSummaries(ctx.rls, ctx.orgId, Array.from(byId.values()));
  }

  const counted = all.rows.filter((p) => isCountedProject(p.status));
  const working = all.rows.filter((p) => WORKING_STATUSES.includes(p.status)).length;
  const portfolio = ctx.canSeeCost
    ? summarizePortfolio(counted.map((p) => ({ status: p.status, summary: summaries.get(p.id)! })))
    : null;
  const contractTotal = portfolio
    ? portfolio.contract_total
    : sumDefined(counted.map((p) => p.contract_amount));

  const rows: ProjectListRow[] = pageData.rows.map((p) => {
    const s = summaries.get(p.id);
    return {
      id: p.id,
      project_code: p.project_code,
      name: p.name,
      customer_name: p.customer_name,
      status: p.status,
      contract_amount: p.contract_amount ?? null,
      // viewer ต้องไม่ได้รับค่าต้นทุนติดไปกับ props (ซ่อนคอลัมน์อย่างเดียวไม่พอ)
      actual_cost: ctx.canSeeCost && s ? s.actual_cost : null,
      progress_pct: ctx.canSeeCost && s ? s.progress_pct : null,
      forecast_profit: ctx.canSeeCost && s ? s.forecast_profit : null,
      over_budget: ctx.canSeeCost && s ? s.over_budget : false,
    };
  });

  return (
    <PageShell
      title="โครงการ"
      description="ทะเบียนงานรับเหมา ตั้งแต่สำรวจหน้างานจนปิดโครงการ"
      icon={<FolderKanban className="h-6 w-6" />}
      width="full"
    >
      <div
        className={`grid grid-cols-1 gap-3 ${ctx.canSeeCost ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2"}`}
      >
        <StatCard
          icon={<FolderKanban className="h-4 w-4" />}
          label="โครงการที่ทำอยู่"
          value={working.toLocaleString("th-TH")}
          sub={`นับจาก ${counted.length.toLocaleString("th-TH")} โครงการ (ไม่รวมยกเลิก/ไม่ได้งาน)`}
          tone="info"
        />
        <StatCard
          icon={<Landmark className="h-4 w-4" />}
          label="มูลค่าสัญญารวม"
          value={moneyShort(contractTotal)}
          sub={money(contractTotal)}
          tone="primary"
        />
        {ctx.canSeeCost && portfolio && (
          <>
            <StatCard
              icon={<TrendingDown className="h-4 w-4" />}
              label="ต้นทุนจริงสะสม"
              value={moneyShort(portfolio.actual_total)}
              sub={`${money(portfolio.actual_total)} · เกินงบ ${portfolio.over_budget_count.toLocaleString("th-TH")} โครงการ`}
              tone={portfolio.over_budget_count > 0 ? "warning" : "neutral"}
            />
            <StatCard
              icon={<ReceiptText className="h-4 w-4" />}
              label="ยอดค้างวางบิล"
              value={moneyShort(portfolio.unbilled_total)}
              sub={`${money(portfolio.unbilled_total)} · จาก ${portfolio.projects_counted.toLocaleString("th-TH")} โครงการ`}
              tone="warning"
            />
          </>
        )}
      </div>

      {all.truncated && (
        <p className="text-xs text-amber-700">
          ยอดรวมด้านบนคิดจาก {all.rows.length.toLocaleString("th-TH")} โครงการแรกจากทั้งหมด{" "}
          {all.total.toLocaleString("th-TH")} โครงการ — ตัวเลขยังไม่ครบทั้งหมด
        </p>
      )}

      <ProjectsClient
        orgId={ctx.orgId}
        orgSlug={orgSlug}
        canWrite={ctx.canWrite}
        canSeeCost={ctx.canSeeCost}
        rows={rows}
        total={pageData.total}
        page={page}
        pageSize={PAGE_SIZE}
        status={status}
        q={q}
      />
    </PageShell>
  );
}
