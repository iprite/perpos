// page.tsx — ภาพรวมกลุ่ม (server component, searchParams-driven ตาม CONTEXT §5)
// ตัวเลขทุกตัวมาจาก lib/p2p-group/metrics.ts แหล่งเดียว (contract §6)

import { Building2, Landmark, TrendingUp, Users, Wallet } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCompanies, listFinancials } from "@/lib/p2p-group/queries";
import { grossProfit, groupTotals, monthStart, netMargin } from "@/lib/p2p-group/metrics";
import {
  COMPANY_STATUS_LABEL,
  COMPANY_TYPE_LABEL,
  FINANCIAL_SOURCE_LABEL,
  formatMoney,
  formatPct,
  formatThaiMonth,
} from "@/lib/p2p-group/labels";
import { requireP2pGroupPage } from "./_components/guard";
import { MonthFilter } from "./_components/month-filter";
import { Coverage } from "./_components/coverage";

export default async function P2pGroupDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { orgSlug } = await params;
  const { period } = await searchParams;
  const ctx = await requireP2pGroupPage(orgSlug);

  const periodMonth = /^\d{4}-\d{2}-01$/.test(period ?? "")
    ? (period as string)
    : monthStart(new Date());

  const [companies, financials] = await Promise.all([
    listCompanies(ctx.rls, ctx.orgId),
    // viewer อ่านตารางฐานไม่ได้ (RLS) → ต้องอ่านผ่าน view ที่มีเฉพาะคอลัมน์ไม่อ่อนไหว
    listFinancials(ctx.rls, ctx.orgId, { periodMonth, basic: !ctx.canSeeMoney }),
  ]);

  // บริษัทลูก = ทุกบริษัทที่ไม่ใช่บริษัทแม่ (โฮลดิ้งไม่มีรายได้ดำเนินงานของตัวเอง)
  const subsidiaries = companies.filter((c) => c.company_type !== "holding");
  const subIds = new Set(subsidiaries.map((c) => c.id));
  const subFinancials = financials.filter((f) => subIds.has(f.company_id));
  const totals = groupTotals(subFinancials, subsidiaries.length);
  const finByCompany = new Map(financials.map((f) => [f.company_id, f]));

  return (
    <PageShell
      title="ภาพรวมกลุ่ม"
      description={`ผลประกอบการรวมของบริษัทในเครือ — งวด ${formatThaiMonth(periodMonth)}`}
      icon={<Building2 className="h-6 w-6" />}
      width="wide"
      actions={<MonthFilter value={periodMonth} />}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="รายได้รวมทั้งกลุ่ม"
            value={formatMoney(totals.revenue)}
            sub={<Coverage counted={totals.counted} total={totals.total} />}
            tone="positive"
            valueColored
          />
          {ctx.canSeeMoney && (
            <StatCard
              icon={<Landmark className="h-4 w-4" />}
              label="กำไรสุทธิรวม"
              value={formatMoney(totals.netProfit)}
              sub={<Coverage counted={totals.counted} total={totals.total} />}
              tone={(totals.netProfit ?? 0) >= 0 ? "positive" : "negative"}
              valueColored
            />
          )}
          {ctx.canSeeMoney && (
            <StatCard
              icon={<Wallet className="h-4 w-4" />}
              label="เงินสดคงเหลือรวม"
              value={formatMoney(totals.cash)}
              sub={<Coverage counted={totals.counted} total={totals.total} />}
              tone="info"
              valueColored
            />
          )}
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="บริษัทในเครือ"
            value={`${subsidiaries.length}`}
            sub={
              totals.headcount != null ? `พนักงานรวม ${totals.headcount} คน` : "ยังไม่ระบุพนักงาน"
            }
            tone="neutral"
          />
        </div>

        {totals.missing > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            ยังไม่มีตัวเลขของ {totals.missing} บริษัทในงวดนี้ — ยอดรวมด้านบนจึงยังไม่ครบทั้งกลุ่ม
            (ไปกรอกที่เมนู &quot;ตัวเลขรายเดือน&quot;)
          </div>
        )}

        <div>
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
            ผลประกอบการรายบริษัท
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>บริษัท</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead align="right">ถือหุ้น</TableHead>
                <TableHead align="right">รายได้</TableHead>
                {ctx.canSeeMoney && <TableHead align="right">กำไรขั้นต้น</TableHead>}
                {ctx.canSeeMoney && <TableHead align="right">กำไรสุทธิ</TableHead>}
                {ctx.canSeeMoney && <TableHead align="right">อัตรากำไร</TableHead>}
                <TableHead align="center">ที่มาข้อมูล</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableEmpty colSpan={ctx.canSeeMoney ? 8 : 5}>
                  ยังไม่มีบริษัทในทะเบียน — เพิ่มที่เมนู &quot;บริษัทในเครือ&quot;
                </TableEmpty>
              ) : (
                companies.map((c) => {
                  const f = finByCompany.get(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium text-gray-900">{c.name}</div>
                        <div className="text-xs text-gray-500">
                          {COMPANY_STATUS_LABEL[c.company_status]}
                        </div>
                      </TableCell>
                      <TableCell>{COMPANY_TYPE_LABEL[c.company_type]}</TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {c.ownership_pct == null ? "—" : `${c.ownership_pct}%`}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(f?.revenue ?? null)}
                      </TableCell>
                      {ctx.canSeeMoney && (
                        <TableCell align="right" tabular>
                          {formatMoney(f ? grossProfit(f) : null)}
                        </TableCell>
                      )}
                      {ctx.canSeeMoney && (
                        <TableCell align="right" tabular>
                          {formatMoney(f?.net_profit ?? null)}
                        </TableCell>
                      )}
                      {ctx.canSeeMoney && (
                        <TableCell align="right" className="tabular-nums">
                          {formatPct(f ? netMargin(f) : null)}
                        </TableCell>
                      )}
                      <TableCell align="center">
                        {f ? (
                          <StatusBadge tone={f.source === "accounting" ? "success" : "neutral"}>
                            {FINANCIAL_SOURCE_LABEL[f.source]}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="warning">ยังไม่มีข้อมูล</StatusBadge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div>
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">โครงสร้างกลุ่ม</div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            {companies.filter((c) => c.company_type === "holding").length === 0 ? (
              <p className="text-sm text-gray-500">
                ยังไม่ได้ระบุบริษัทแม่ — ตั้งประเภทเป็น &quot;บริษัทแม่&quot;
                ให้บริษัทหนึ่งในทะเบียน
              </p>
            ) : (
              companies
                .filter((c) => c.company_type === "holding")
                .map((h) => (
                  <div key={h.id}>
                    <div className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">
                      <Building2 className="h-4 w-4" />
                      {h.name}
                    </div>
                    <ul className="ms-4 mt-3 space-y-2 border-s border-gray-200 ps-5">
                      {subsidiaries.map((s) => (
                        <li key={s.id} className="relative">
                          <span className="absolute -start-5 top-1/2 h-px w-4 bg-gray-200" />
                          <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                            <span className="font-medium text-gray-900">{s.name}</span>
                            <span className="text-xs text-gray-500">
                              {COMPANY_TYPE_LABEL[s.company_type]}
                            </span>
                            {s.ownership_pct != null && (
                              <StatusBadge tone="info">ถือหุ้น {s.ownership_pct}%</StatusBadge>
                            )}
                          </div>
                        </li>
                      ))}
                      {subsidiaries.length === 0 && (
                        <li className="text-sm text-gray-500">ยังไม่มีบริษัทย่อยในทะเบียน</li>
                      )}
                    </ul>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
