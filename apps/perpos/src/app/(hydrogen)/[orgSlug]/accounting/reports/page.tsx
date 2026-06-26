"use client";

// reports/page.tsx — B3 รายงานการเงิน (หลังบ้าน)
//   Tab (overflow-x-auto): งบทดลอง / งบกำไรขาดทุน / งบแสดงฐานะการเงิน / แยกประเภท (ledger)
//   เรียก /api/accounting/reports?type=&from=&to=&account= แบบ on-demand (auto-load ตาม filter)
//   ตัด AI สรุปงบ ออก · view only
// gate §4: reports — owner(V) · accountant(V) · staff(–) · viewer(V)

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Scale, TrendingUp, Landmark, ListTree } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  fmtMoney,
  fmtDateTH,
  NoAccess,
} from "../_components";

type ReportTab = "trial" | "income" | "balance" | "ledger";

const TABS: { key: ReportTab; label: string; icon: React.ReactNode }[] = [
  { key: "trial", label: "งบทดลอง", icon: <Scale className="h-4 w-4" /> },
  { key: "income", label: "งบกำไรขาดทุน", icon: <TrendingUp className="h-4 w-4" /> },
  { key: "balance", label: "งบแสดงฐานะการเงิน", icon: <Landmark className="h-4 w-4" /> },
  { key: "ledger", label: "แยกประเภท", icon: <ListTree className="h-4 w-4" /> },
];

// period → { from, to } (CE) — "ทั้งปี" = ทั้งปี, "ถึงเดือน X" = ม.ค. ถึงสิ้นเดือน X
const PERIOD_OPTIONS = [
  { value: "0", label: "ทั้งปี 2569" },
  { value: "4", label: "ถึง เมษายน 2569" },
  { value: "5", label: "ถึง พฤษภาคม 2569" },
  { value: "6", label: "ถึง มิถุนายน 2569" },
];
const REPORT_YEAR = 2026;

function periodRange(monthStr: string): { from: string; to: string } {
  const month = Number(monthStr);
  const from = `${REPORT_YEAR}-01-01`;
  if (month === 0) return { from, to: `${REPORT_YEAR}-12-31` };
  const lastDay = new Date(REPORT_YEAR, month, 0).getDate();
  return {
    from,
    to: `${REPORT_YEAR}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

// report shapes (= contract lib/accounting/reports.ts)
interface TrialRow {
  account_id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
}
interface TrialReport {
  rows: TrialRow[];
  totalDebit: number;
  totalCredit: number;
}
interface AmtRow {
  code: string;
  name: string;
  amount: number;
}
interface IncomeReport {
  income: AmtRow[];
  expense: AmtRow[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
}
interface BalanceReport {
  assets: AmtRow[];
  liabilities: AmtRow[];
  equity: AmtRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}
interface LedgerRow {
  entry_date: string;
  entry_number: string;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
}
interface LedgerReport {
  rows: LedgerRow[];
}

export default function ReportsPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "reports");

  const { accounts, apiGetRaw } = useAccountingData();

  const [tab, setTab] = useState<ReportTab>("trial");
  const [period, setPeriod] = useState("0");
  const [ledgerAcc, setLedgerAcc] = useState("");

  const [trial, setTrial] = useState<TrialReport | null>(null);
  const [income, setIncome] = useState<IncomeReport | null>(null);
  const [balance, setBalance] = useState<BalanceReport | null>(null);
  const [ledger, setLedger] = useState<LedgerReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const accountOptions = useMemo(
    () => [
      { value: "", label: "— เลือกบัญชี —" },
      ...[...accounts]
        .filter((a) => a.is_active)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    ],
    [accounts],
  );

  const selectedLedgerAccount = useMemo(
    () => accounts.find((a) => a.id === ledgerAcc) ?? null,
    [accounts, ledgerAcc],
  );

  // on-demand fetch ตาม (tab, period, ledgerAcc) — auto-load (ไม่มีปุ่ม refresh)
  useEffect(() => {
    if (!canView) return;
    const { from, to } = periodRange(period);
    let cancelled = false;

    async function run() {
      setReportLoading(true);
      try {
        if (tab === "trial") {
          const { report } = await apiGetRaw<{ report: TrialReport }>(
            `reports?type=trial-balance&from=${from}&to=${to}`,
          );
          if (!cancelled) setTrial(report);
        } else if (tab === "income") {
          const { report } = await apiGetRaw<{ report: IncomeReport }>(
            `reports?type=income-statement&from=${from}&to=${to}`,
          );
          if (!cancelled) setIncome(report);
        } else if (tab === "balance") {
          // ดึง balance-sheet + income-statement (สะสมตั้งแต่ต้นปีถึง to) คู่กัน
          // เพื่อให้กำไรสะสมงวดในส่วนของเจ้าของครบในตัว
          const [bs, is] = await Promise.all([
            apiGetRaw<{ report: BalanceReport }>(`reports?type=balance-sheet&to=${to}`),
            apiGetRaw<{ report: IncomeReport }>(
              `reports?type=income-statement&from=${from}&to=${to}`,
            ),
          ]);
          if (!cancelled) {
            setBalance(bs.report);
            setIncome(is.report);
          }
        } else if (tab === "ledger") {
          if (!ledgerAcc) {
            if (!cancelled) setLedger(null);
          } else {
            const { report } = await apiGetRaw<{ report: LedgerReport }>(
              `reports?type=ledger&account=${ledgerAcc}&from=${from}&to=${to}`,
            );
            if (!cancelled) setLedger(report);
          }
        }
      } catch (e) {
        if (!cancelled) toast.error((e as Error).message || "โหลดรายงานไม่สำเร็จ");
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [canView, tab, period, ledgerAcc, apiGetRaw]);

  // ตัวบ่งชี้สมดุล (จาก data ที่โหลดมา)
  const trialBalanced = trial != null && Math.abs(trial.totalDebit - trial.totalCredit) < 0.01;
  const balanceTotalLiabEquity = balance
    ? balance.totalLiabilities + balance.totalEquity + (income?.netProfit ?? 0)
    : 0;

  if (!canView)
    return (
      <NoAccess title="รายงานการเงิน" icon={<BarChart3 className="h-6 w-6" />}>
        หน้าหลังบ้านนี้สำหรับนักบัญชี — บทบาทของคุณไม่มีสิทธิ์ดูรายงานการเงิน
      </NoAccess>
    );

  const tabs = (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => (
        <Button
          key={t.key}
          size="sm"
          variant={tab === t.key ? "secondary" : "ghost"}
          className={cn("shrink-0 whitespace-nowrap", tab === t.key && "bg-gray-100 text-gray-900")}
          onClick={() => setTab(t.key)}
        >
          <span className="mr-1.5">{t.icon}</span>
          {t.label}
        </Button>
      ))}
    </div>
  );

  return (
    <AccountingShell
      title="รายงานการเงิน"
      description="ปิดงบ/ส่งผู้สอบบัญชีได้ — งบทดลอง กำไรขาดทุน ฐานะการเงิน และบัญชีแยกประเภท"
      icon={<BarChart3 className="h-6 w-6" />}
      actions={
        <CustomSelect
          value={period}
          onChange={setPeriod}
          options={PERIOD_OPTIONS}
          className="w-48"
        />
      }
      tabs={tabs}
    >
      {/* งบทดลอง */}
      {tab === "trial" && (
        <div>
          <div className="mb-2.5 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-gray-900">งบทดลอง (Trial Balance)</span>
            {trial && (
              <StatusBadge tone={trialBalanced ? "success" : "danger"}>
                {trialBalanced ? "สมดุล" : "ไม่สมดุล"}
              </StatusBadge>
            )}
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>เลขที่</TableHead>
                <TableHead>ชื่อบัญชี</TableHead>
                <TableHead align="right">เดบิต</TableHead>
                <TableHead align="right">เครดิต</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportLoading ? (
                <TableLoading colSpan={4} />
              ) : !trial || trial.rows.length === 0 ? (
                <TableEmpty colSpan={4}>ไม่มีรายการในงวดนี้</TableEmpty>
              ) : (
                trial.rows.map((r) => (
                  <TableRow key={r.account_id}>
                    <TableCell className="font-mono text-xs tabular-nums text-gray-400">
                      {r.code}
                    </TableCell>
                    <TableCell className="text-gray-700">{r.name}</TableCell>
                    <TableCell align="right" tabular className="text-gray-900">
                      {r.debit ? fmtMoney(r.debit, { currency: false }) : "—"}
                    </TableCell>
                    <TableCell align="right" tabular className="text-gray-900">
                      {r.credit ? fmtMoney(r.credit, { currency: false }) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {trial && trial.rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>รวม</TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(trial.totalDebit, { currency: false })}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(trial.totalCredit, { currency: false })}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}

      {/* งบกำไรขาดทุน */}
      {tab === "income" && (
        <div>
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
            งบกำไรขาดทุน (Income Statement)
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>รายการ</TableHead>
                <TableHead align="right">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportLoading ? (
                <TableLoading colSpan={2} />
              ) : !income ? (
                <TableEmpty colSpan={2}>ไม่มีรายการในงวดนี้</TableEmpty>
              ) : (
                <>
                  <TableRow>
                    <TableCell className="font-semibold text-gray-900">รายได้</TableCell>
                    <TableCell />
                  </TableRow>
                  {income.income.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell className="pl-8 text-gray-600">
                        {r.code} · {r.name}
                      </TableCell>
                      <TableCell align="right" tabular className="text-green-600">
                        {fmtMoney(r.amount, { currency: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="pl-4 font-medium text-gray-700">รวมรายได้</TableCell>
                    <TableCell align="right" tabular className="font-medium text-green-600">
                      {fmtMoney(income.totalIncome, { currency: false })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-gray-900">ค่าใช้จ่าย</TableCell>
                    <TableCell />
                  </TableRow>
                  {income.expense.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell className="pl-8 text-gray-600">
                        {r.code} · {r.name}
                      </TableCell>
                      <TableCell align="right" tabular className="text-red-600">
                        {fmtMoney(r.amount, { currency: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="pl-4 font-medium text-gray-700">รวมค่าใช้จ่าย</TableCell>
                    <TableCell align="right" tabular className="font-medium text-red-600">
                      {fmtMoney(income.totalExpense, { currency: false })}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
            {income && (
              <TableFooter>
                <TableRow>
                  <TableCell>{income.netProfit >= 0 ? "กำไรสุทธิ" : "ขาดทุนสุทธิ"}</TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={income.netProfit >= 0 ? "text-green-600" : "text-red-600"}
                  >
                    {income.netProfit >= 0
                      ? fmtMoney(income.netProfit, { currency: false })
                      : `−${fmtMoney(Math.abs(income.netProfit), { currency: false })}`}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}

      {/* งบแสดงฐานะการเงิน */}
      {tab === "balance" && (
        <div>
          <div className="mb-2.5 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-gray-900">
              งบแสดงฐานะการเงิน (Balance Sheet)
            </span>
            {balance && (
              <StatusBadge
                tone={
                  Math.abs(balance.totalAssets - balanceTotalLiabEquity) < 0.01
                    ? "success"
                    : "danger"
                }
              >
                {Math.abs(balance.totalAssets - balanceTotalLiabEquity) < 0.01
                  ? "สมดุล"
                  : "ไม่สมดุล"}
              </StatusBadge>
            )}
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>รายการ</TableHead>
                <TableHead align="right">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportLoading ? (
                <TableLoading colSpan={2} />
              ) : !balance ? (
                <TableEmpty colSpan={2}>ไม่มีรายการในงวดนี้</TableEmpty>
              ) : (
                <>
                  <TableRow>
                    <TableCell className="font-semibold text-gray-900">สินทรัพย์</TableCell>
                    <TableCell />
                  </TableRow>
                  {balance.assets.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell className="pl-8 text-gray-600">
                        {r.code} · {r.name}
                      </TableCell>
                      <TableCell align="right" tabular className="text-gray-900">
                        {fmtMoney(r.amount, { currency: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="pl-4 font-medium text-gray-700">รวมสินทรัพย์</TableCell>
                    <TableCell align="right" tabular className="font-medium text-gray-900">
                      {fmtMoney(balance.totalAssets, { currency: false })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-gray-900">หนี้สิน</TableCell>
                    <TableCell />
                  </TableRow>
                  {balance.liabilities.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell className="pl-8 text-gray-600">
                        {r.code} · {r.name}
                      </TableCell>
                      <TableCell align="right" tabular className="text-gray-900">
                        {fmtMoney(r.amount, { currency: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold text-gray-900">ส่วนของเจ้าของ</TableCell>
                    <TableCell />
                  </TableRow>
                  {balance.equity.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell className="pl-8 text-gray-600">
                        {r.code} · {r.name}
                      </TableCell>
                      <TableCell align="right" tabular className="text-gray-900">
                        {fmtMoney(r.amount, { currency: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="pl-8 text-gray-600">กำไร(ขาดทุน)สะสมงวดนี้</TableCell>
                    <TableCell
                      align="right"
                      tabular
                      className={(income?.netProfit ?? 0) >= 0 ? "text-green-600" : "text-red-600"}
                    >
                      {(income?.netProfit ?? 0) >= 0
                        ? fmtMoney(income?.netProfit ?? 0, { currency: false })
                        : `−${fmtMoney(Math.abs(income?.netProfit ?? 0), { currency: false })}`}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
            {balance && (
              <TableFooter>
                <TableRow>
                  <TableCell>รวมหนี้สิน + ส่วนของเจ้าของ</TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(balanceTotalLiabEquity, { currency: false })}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}

      {/* แยกประเภท (ledger) */}
      {tab === "ledger" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <CustomSelect
              value={ledgerAcc}
              onChange={setLedgerAcc}
              options={accountOptions}
              className="w-full sm:w-96"
            />
          </div>
          {!ledgerAcc ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
              <div className="mb-4 rounded-full bg-gray-100 p-4">
                <ListTree className="h-8 w-8 text-gray-400" />
              </div>
              <Text className="text-sm font-medium text-gray-900">
                เลือกบัญชีเพื่อดูบัญชีแยกประเภท
              </Text>
              <Text className="mt-1 text-sm text-gray-500">
                แสดงเดบิต-เครดิตและยอดคงเหลือสะสมของบัญชีที่เลือก
              </Text>
            </div>
          ) : (
            <div>
              <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
                {selectedLedgerAccount?.code} · {selectedLedgerAccount?.name}
              </div>
              <Table className="shadow-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>เลขที่</TableHead>
                    <TableHead>คำอธิบาย</TableHead>
                    <TableHead align="right">เดบิต</TableHead>
                    <TableHead align="right">เครดิต</TableHead>
                    <TableHead align="right">คงเหลือ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportLoading ? (
                    <TableLoading colSpan={6} />
                  ) : !ledger || ledger.rows.length === 0 ? (
                    <TableEmpty colSpan={6}>ไม่มีรายการเคลื่อนไหวในงวดนี้</TableEmpty>
                  ) : (
                    ledger.rows.map((r, i) => (
                      <TableRow key={`${r.entry_number}-${i}`}>
                        <TableCell className="whitespace-nowrap text-gray-500">
                          {fmtDateTH(r.entry_date)}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">
                          {r.entry_number}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-gray-600">
                          {r.description ?? "—"}
                        </TableCell>
                        <TableCell align="right" tabular className="text-gray-900">
                          {r.debit ? fmtMoney(r.debit, { currency: false }) : "—"}
                        </TableCell>
                        <TableCell align="right" tabular className="text-gray-900">
                          {r.credit ? fmtMoney(r.credit, { currency: false }) : "—"}
                        </TableCell>
                        <TableCell align="right" tabular className="font-medium text-gray-900">
                          {fmtMoney(r.balance, { currency: false })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </AccountingShell>
  );
}
