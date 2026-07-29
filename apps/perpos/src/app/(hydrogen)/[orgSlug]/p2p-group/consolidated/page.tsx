// consolidated/page.tsx — งบรวมกลุ่ม (server component ล้วน — display อย่างเดียว)
// viewer เข้าไม่ได้ (requireP2pGroupMoneyPage) เพราะทั้งหน้าเป็นตัวเลขอ่อนไหว

import { BarChart3 } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LinkTablePager } from "@/components/ui/table-pager";
import { listCompanies, listFinancials, listIntercompany } from "@/lib/p2p-group/queries";
import { consolidate, grossProfit, isEliminated, monthStart } from "@/lib/p2p-group/metrics";
import {
  IC_TYPE_LABEL,
  formatMoney,
  formatThaiDate,
  formatThaiMonth,
} from "@/lib/p2p-group/labels";
import { requireP2pGroupMoneyPage } from "../_components/guard";
import { MonthFilter } from "../_components/month-filter";
import { Coverage } from "../_components/coverage";

export default async function ConsolidatedPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ period?: string; page?: string }>;
}) {
  const { orgSlug } = await params;
  const { period, page: pageParam } = await searchParams;
  const ctx = await requireP2pGroupMoneyPage(orgSlug);

  const periodMonth = /^\d{4}-\d{2}-01$/.test(period ?? "")
    ? (period as string)
    : monthStart(new Date());

  const [companies, financials, intercompany] = await Promise.all([
    listCompanies(ctx.rls, ctx.orgId),
    listFinancials(ctx.rls, ctx.orgId, { periodMonth }),
    listIntercompany(ctx.rls, ctx.orgId, { periodMonth }),
  ]);

  const subsidiaries = companies.filter((c) => c.company_type !== "holding");
  const subIds = new Set(subsidiaries.map((c) => c.id));
  const subFinancials = financials.filter((f) => subIds.has(f.company_id));
  const result = consolidate(subFinancials, intercompany, subsidiaries.length);
  const eliminated = intercompany.filter(isEliminated);
  // แบ่งหน้าฝั่ง server — page อยู่ใน searchParams (ดู DESIGN.md §5.1 ท่าที่ 3)
  const ELIM_PAGE_SIZE = 20;
  const elimPage = Math.max(1, Number(pageParam ?? 1) || 1);
  const elimRows = eliminated.slice((elimPage - 1) * ELIM_PAGE_SIZE, elimPage * ELIM_PAGE_SIZE);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const finByCompany = new Map(financials.map((f) => [f.company_id, f]));

  return (
    <PageShell
      title="งบรวมกลุ่ม"
      description={`รวมผลประกอบการทุกบริษัทแล้วตัดรายการระหว่างกัน — งวด ${formatThaiMonth(periodMonth)}`}
      icon={<BarChart3 className="h-6 w-6" />}
      width="wide"
      actions={<MonthFilter value={periodMonth} />}
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          ตัวเลขในหน้านี้เป็น <strong>งบรวมเพื่อการบริหาร</strong> —
          รวมยอดทุกบริษัทแล้วหักรายการระหว่างกัน ยังไม่ใช่งบการเงินรวมตามมาตรฐานการบัญชี
          (ไม่มีการปันส่วนส่วนได้เสียที่ไม่มีอำนาจควบคุมและค่าความนิยม)
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="รายได้รวมก่อนตัดรายการ"
            value={formatMoney(result.combinedRevenue)}
            sub={<Coverage counted={result.counted} total={result.total} />}
            tone="neutral"
          />
          <StatCard
            label="รายการระหว่างกันที่ตัดออก"
            value={formatMoney(result.eliminations)}
            sub={`${result.eliminationCount} รายการ`}
            tone="warning"
            valueColored
          />
          <StatCard
            label="รายได้รวมของกลุ่ม"
            value={formatMoney(result.consolidatedRevenue)}
            sub={<Coverage counted={result.counted} total={result.total} />}
            tone="positive"
            valueColored
          />
        </div>

        <div>
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
            งบรวม — แยกตามบริษัท
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>บริษัท</TableHead>
                <TableHead align="right">รายได้</TableHead>
                <TableHead align="right">ต้นทุนขาย</TableHead>
                <TableHead align="right">กำไรขั้นต้น</TableHead>
                <TableHead align="right">กำไรสุทธิ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subsidiaries.length === 0 ? (
                <TableEmpty colSpan={5}>ยังไม่มีบริษัทย่อยในทะเบียน</TableEmpty>
              ) : (
                subsidiaries.map((c) => {
                  const f = finByCompany.get(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(f?.revenue ?? null)}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(f?.cogs ?? null)}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(f ? grossProfit(f) : null)}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(f?.net_profit ?? null)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            {subsidiaries.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell>รวมก่อนตัดรายการ</TableCell>
                  <TableCell align="right" tabular>
                    {formatMoney(result.combinedRevenue)}
                  </TableCell>
                  <TableCell align="right">—</TableCell>
                  <TableCell align="right">—</TableCell>
                  <TableCell align="right" tabular>
                    {formatMoney(result.combinedNetProfit)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>หัก รายการระหว่างกัน</TableCell>
                  <TableCell align="right" tabular>
                    {result.eliminations ? formatMoney(-result.eliminations) : formatMoney(0)}
                  </TableCell>
                  <TableCell align="right">—</TableCell>
                  <TableCell align="right">—</TableCell>
                  <TableCell align="right">—</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>งบรวมของกลุ่ม</TableCell>
                  <TableCell align="right" tabular>
                    {formatMoney(result.consolidatedRevenue)}
                  </TableCell>
                  <TableCell align="right">—</TableCell>
                  <TableCell align="right">—</TableCell>
                  <TableCell align="right" tabular>
                    {formatMoney(result.consolidatedNetProfit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        <div>
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
            รายการที่ถูกตัดออกในงวดนี้
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead align="center">วันที่</TableHead>
                <TableHead>จาก</TableHead>
                <TableHead>ถึง</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead align="right">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eliminated.length === 0 ? (
                <TableEmpty colSpan={5}>
                  งวดนี้ไม่มีรายการระหว่างบริษัทที่ต้องตัดออก — ยอดรวมจึงเท่ากับผลบวกของทุกบริษัท
                </TableEmpty>
              ) : (
                elimRows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell align="center" className="tabular-nums">
                      {formatThaiDate(t.txn_date)}
                    </TableCell>
                    <TableCell>{companyName.get(t.from_company_id) ?? "—"}</TableCell>
                    <TableCell>{companyName.get(t.to_company_id) ?? "—"}</TableCell>
                    <TableCell>{IC_TYPE_LABEL[t.ic_type]}</TableCell>
                    <TableCell align="right" tabular>
                      {formatMoney(t.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <LinkTablePager
            page={elimPage}
            pageSize={ELIM_PAGE_SIZE}
            total={eliminated.length}
            query={{ period }}
            unit="รายการ"
          />
        </div>
      </div>
    </PageShell>
  );
}
